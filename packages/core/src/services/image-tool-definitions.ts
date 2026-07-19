import { ToolDefinition } from './user-config'

/**
 * Tool definition with metadata for image generation
 *
 * EXTENSIBILITY NOTE:
 * When adding new models/providers in the future:
 * 1. Create a new ToolDefinition matching the API's parameter names exactly
 * 2. Set supportsEdit: true if the model supports image editing
 * 3. Implement endpointSelector if the model uses different endpoints for txt2img vs edit
 * 4. Add to TOOL_DEFINITION_REGISTRY with a unique key
 */

/**
 * Clean schema by removing unsupported custom fields (e.g., x-order, x-*, title, etc.)
 * Only keeps standard JSON Schema fields supported by AI APIs
 */
function cleanSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') {
    return schema
  }

  if (Array.isArray(schema)) {
    return schema.map(cleanSchema)
  }

  const cleaned: any = {}
  // Standard JSON Schema fields supported by most AI APIs
  const allowedFields = [
    'type', 'description', 'properties', 'required', 'enum',
    'items', 'minimum', 'maximum', 'default', 'format',
    'minItems', 'maxItems', 'minLength', 'maxLength'
  ]

  for (const key of allowedFields) {
    if (key in schema) {
      if (key === 'properties' && typeof schema[key] === 'object') {
        // Recursively clean nested properties
        cleaned[key] = {}
        for (const propKey in schema[key]) {
          cleaned[key][propKey] = cleanSchema(schema[key][propKey])
        }
      } else if (key === 'items' && typeof schema[key] === 'object') {
        // Recursively clean array items schema
        cleaned[key] = cleanSchema(schema[key])
      } else {
        cleaned[key] = schema[key]
      }
    }
  }

  return cleaned
}

/**
 * Convert Claude Tool Use format to OpenAI Chat Completions API format
 *
 * Claude format:
 * {
 *   name: "...",
 *   description: "...",
 *   input_schema: { type: "object", properties: {...}, required: [...] }
 * }
 *
 * OpenAI Chat Completions API format (nested structure):
 * {
 *   type: "function",
 *   function: {
 *     name: "...",
 *     description: "...",
 *     parameters: { type: "object", properties: {...}, required: [...] }
 *   }
 * }
 *
 * Note: This is for the standard Chat Completions API (/v1/chat/completions).
 * For Responses API, use convertClaudeToolToOpenAIResponses instead.
 */
export function convertClaudeToolToOpenAI(claudeTool: ToolDefinition): any {
  return {
    type: 'function',
    function: {
      name: claudeTool.name,
      description: claudeTool.description,
      parameters: cleanSchema(claudeTool.input_schema),
    }
  }
}

/**
 * Convert Claude Tool Use format to OpenAI Responses API format
 *
 * OpenAI Responses API format (flat structure):
 * {
 *   type: "function",
 *   name: "...",
 *   description: "...",
 *   parameters: { type: "object", properties: {...}, required: [...] }
 * }
 *
 * Note: This is specifically for the Responses API (/v1/responses).
 * For standard Chat Completions API, use convertClaudeToolToOpenAI instead.
 */
export function convertClaudeToolToOpenAIResponses(claudeTool: ToolDefinition): any {
  return {
    type: 'function',
    name: claudeTool.name,
    description: claudeTool.description,
    parameters: cleanSchema(claudeTool.input_schema),
  }
}

/**
 * Convert Claude tool format to Gemini API format
 * Claude: { name, description, input_schema }
 * Gemini: { functionDeclarations: [{ name, description, parameters }] }
 *
 * Gemini API only supports standard JSON Schema fields and rejects custom fields like x-order
 */
export function convertClaudeToolToGemini(claudeTool: ToolDefinition): any {
  return {
    functionDeclarations: [{
      name: claudeTool.name,
      description: claudeTool.description,
      parameters: cleanSchema(claudeTool.input_schema),
    }]
  }
}

/**
 * Image input format for different API providers
 */
export type ImageInputFormat =
  | 'base64-string'      // Single base64 string (e.g., Novita Qwen)
  | 'base64-array'       // Array of base64 strings (e.g., Novita Seedream)
  | 'openai-image-url'   // Array of { image_url: "data:..." } objects (e.g., OpenAI GPT Image)

/**
 * Configuration for API processing
 * Separated from Tool Call (JSON definition passed to LLM)
 */
export interface ImageApiConfig {
  /** API endpoint URL or function to determine endpoint */
  endpoint: string | ((hasImages: boolean, baseHost: string) => string)
  /** Whether this is a synchronous API (returns image directly) or async (returns task_id for polling) */
  isAsync: boolean
  /** Whether this model supports image editing (img2img) */
  supportsEdit: boolean
  /** When set, user-provided images are automatically injected into this request field */
  imageInputField?: string
  /** Format for encoding images (defaults to 'base64-string' for backward compatibility) */
  imageInputFormat?: ImageInputFormat
}

/**
 * Complete configuration for image generation model
 * - toolDefinition: Tool Call definition passed to LLM
 * - apiConfig: Configuration for API calls
 */
export interface ImageModelConfig {
  /** Tool definition in Claude format (for LLM) */
  toolDefinition: ToolDefinition
  /** API processing configuration (for actual API calls) */
  apiConfig: ImageApiConfig
}

/**
 * Default tool definitions for currently supported models
 */

/**
 * 1. Chutes AI - Chroma (and other standard SD models like FLUX.1-dev)
 * API: https://image.chutes.ai/generate
 * Edit support: No
 */
export const MODEL_CHUTES_CHROMA: ImageModelConfig = {
  toolDefinition: {
    name: 'generate_image',
    description: 'Generate an image using Chroma model. Images supplied by the user are not forwarded, so describe any visual references directly in the prompt.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'A detailed description of the image to generate. Be specific and descriptive.',
        },
        negative_prompt: {
          type: 'string',
          description: 'Things to avoid in the image (e.g., "blurry, low quality")',
        },
        width: {
          type: 'number',
          description: 'Image width in pixels',
          default: 1280,
        },
        height: {
          type: 'number',
          description: 'Image height in pixels',
          default: 1280,
        },
        num_inference_steps: {
          type: 'number',
          description: 'Number of inference steps (higher = better quality but slower)',
          default: 50,
        },
        guidance_scale: {
          type: 'number',
          description: 'How closely to follow the prompt (7-15 recommended)',
          default: 7.5,
        },
        seed: {
          type: 'number',
          description: 'Random seed for reproducibility (optional)',
        },
      },
      required: ['prompt'],
    },
  },
  apiConfig: {
    endpoint: (hasImages: boolean, baseHost: string) => {
      const cleanHost = baseHost.replace(/\/$/, '')
      return `${cleanHost}/generate`
    },
    isAsync: false,
    supportsEdit: false,
  },
}

/**
 * 2. Novita AI - Qwen Image
 * API: https://api.novita.ai/v3/async/qwen-image-txt2img (txt2img)
 *      https://api.novita.ai/v3/async/qwen-image-edit (edit)
 * Edit support: Yes - different endpoints
 */
export const MODEL_NOVITA_QWEN: ImageModelConfig = {
  toolDefinition: {
    name: 'generate_image',
    description: 'Generate or edit an image using Qwen Image model. When the user provides images, it will automatically switch to edit mode. When editing, the "size" parameter is ignored (original image size is used). When generating from scratch, you can specify the "size" parameter.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description for image generation, or editing instructions when user provides images.',
        },
        size: {
          type: 'string',
          description: 'Image resolution in format "WIDTH*HEIGHT". NOTE: This parameter is IGNORED in edit mode (when user provides images).',
          enum: ['1328*1328', '1536*864', '864*1536', '1536*1152', '1152*1536'],
          default: '1328*1328',
        },
        seed: {
          type: 'number',
          description: 'Random seed for reproducibility. Use a specific number (e.g., 42) for consistent results, or -1 for random generation.',
          default: -1,
        },
        output_format: {
          type: 'string',
          description: 'Output image format. "png" for transparency support, "webp" for smaller file size, "jpeg" for standard use.',
          enum: ['jpeg', 'png', 'webp'],
          default: 'jpeg',
        },
      },
      required: ['prompt'],
    },
  },
  apiConfig: {
    endpoint: (hasImages: boolean, baseHost: string) => {
      const cleanHost = baseHost.replace(/\/$/, '')
      return hasImages
        ? `${cleanHost}/v3/async/qwen-image-edit`
        : `${cleanHost}/v3/async/qwen-image-txt2img`
    },
    isAsync: true,
    supportsEdit: true,
    imageInputField: 'image', // ✨ 単数形（editのAPI仕様に合わせる）
  },
}

/**
 * 3. Novita AI - Hunyuan Image 3
 * API: https://api.novita.ai/v3/async/hunyuan-image-3
 * Edit support: No
 */
export const MODEL_NOVITA_HUNYUAN: ImageModelConfig = {
  toolDefinition: {
    name: 'generate_image',
    description: 'Generate an image using Hunyuan Image 3 model. Images provided by the user are not sent to the API, so incorporate any visual details into the prompt text.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'A detailed description of the image to generate. Be specific and descriptive.',
        },
        size: {
          type: 'string',
          description: 'Image size in format "WIDTH*HEIGHT".',
          enum: ['1024*1024', '1536*864', '864*1536', '1536*1152', '1152*1536', '1536*1536'],
          default: '1024*1024',
        },
        seed: {
          type: 'number',
          description: 'Random seed for reproducibility. -1 for random. Range: -1 to 2147483647',
          default: -1,
        },
      },
      required: ['prompt'],
    },
  },
  apiConfig: {
    endpoint: (hasImages: boolean, baseHost: string) => {
      const cleanHost = baseHost.replace(/\/$/, '')
      return `${cleanHost}/v3/async/hunyuan-image-3`
    },
    isAsync: true,
    supportsEdit: false,
  },
}

/**
 * 4. Novita AI - Seedream 4.0
 * API: https://api.novita.ai/v3/seedream-4.0 (synchronous API)
 * Edit support: Yes - same endpoint, images parameter optional
 * Note: This is a SYNCHRONOUS API (not async like other Novita models)
 */
export const MODEL_NOVITA_SEEDREAM: ImageModelConfig = {
  toolDefinition: {
    name: 'generate_image',
    description: 'Generate or edit images using Seedream 4.0 model. Any images attached by the user are automatically forwarded for editing or reference.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed text description for image generation. Recommended: under 600 words in English.',
        },
        size: {
          type: 'string',
          description: 'Image resolution.',
          enum: ['2048x2048', '2048x1152', '1152x2048', '2732x1536', '1536x2732', '4096x4096'],
          default: '2048x2048',
        },
        sequential_image_generation: {
          type: 'string',
          description: 'Enable sequential generation mode. "auto" for automatic batch generation, "disabled" for single image.',
          enum: ['auto', 'disabled'],
          default: 'disabled',
        },
        max_images: {
          type: 'number',
          description: 'Maximum number of images to generate (1-15). Only applies when sequential_image_generation is "auto". Total of reference images + generated images cannot exceed 15.',
          default: 15,
        },
        watermark: {
          type: 'boolean',
          description: 'Add watermark to bottom-right corner. Default is false.',
          default: false,
        },
      },
      required: ['prompt'],
    },
  },
  apiConfig: {
    endpoint: (hasImages: boolean, baseHost: string) => {
      const cleanHost = baseHost.replace(/\/$/, '')
      return `${cleanHost}/v3/seedream-4.0`
    },
    isAsync: false, // ✨ Seedream 4.0 is synchronous
    supportsEdit: true,
    imageInputField: 'images',
    imageInputFormat: 'base64-array',
  },
}

/**
 * 5. Novita AI - GLM Image
 * API: https://api.novita.ai/v3/async/glm-image (async)
 * Edit support: No
 */
export const MODEL_NOVITA_GLM: ImageModelConfig = {
  toolDefinition: {
    name: 'generate_image',
    description: 'Generate an image using GLM Image model. Creates high-quality HD images with fine details and high consistency. Images provided by the user are not sent to the API, so incorporate any visual details into the prompt text.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description of the desired image. Describe the scene, subject, style, and details you want in the generated image.',
        },
        size: {
          type: 'string',
          description: 'Image size in format "WIDTHxHEIGHT".',
          enum: ['1280x1280', '1568x1056', '1056x1568', '1472x1088', '1088x1472', '1728x960', '960x1728', '2048x2048'],
          default: '1280x1280',
        },
        quality: {
          type: 'string',
          description: 'Image quality. HD produces finer details with higher consistency.',
          default: 'hd',
        },
        watermark_enabled: {
          type: 'boolean',
          description: 'Whether to add AI watermark on generated images.',
          default: false,
        },
      },
      required: ['prompt'],
    },
  },
  apiConfig: {
    endpoint: (hasImages: boolean, baseHost: string) => {
      const cleanHost = baseHost.replace(/\/$/, '')
      return `${cleanHost}/v3/async/glm-image`
    },
    isAsync: true,
    supportsEdit: false,
  },
}

/**
 * 6. Novita AI - Seedream 5.0 lite
 * API: https://api.novita.ai/v3/seedream-5.0-lite (synchronous API)
 * Edit support: Yes - same endpoint, image parameter optional
 * Note: Higher resolution than Seedream 4.0. Supports prompt optimization and sequential generation.
 */
export const MODEL_NOVITA_SEEDREAM_5: ImageModelConfig = {
  toolDefinition: {
    name: 'generate_image',
    description: 'Generate or edit images using Seedream 5.0 lite model. Supports text-to-image, single/multi image-to-image, and sequential image generation. Any images attached by the user are automatically forwarded for editing or reference.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed text description for image generation. Supports both Chinese and English. Recommended: under 300 Chinese characters or 600 English words.',
        },
        size: {
          type: 'string',
          description: 'Image resolution.',
          enum: ['2048x2048', '2048x1152', '1152x2048', '2732x1536', '1536x2732', '3072x3072'],
          default: '2048x2048',
        },
        sequential_image_generation: {
          type: 'string',
          description: 'Enable sequential generation mode. "auto" for automatic batch generation based on prompt, "disabled" for single image.',
          enum: ['auto', 'disabled'],
          default: 'disabled',
        },
        max_images: {
          type: 'number',
          description: 'Maximum number of images to generate (1-15). Only applies when sequential_image_generation is "auto". Total of reference images + generated images cannot exceed 15.',
          default: 15,
        },
        watermark: {
          type: 'boolean',
          description: 'Add watermark to generated images.',
          default: false,
        },
      },
      required: ['prompt'],
    },
  },
  apiConfig: {
    endpoint: (hasImages: boolean, baseHost: string) => {
      const cleanHost = baseHost.replace(/\/$/, '')
      return `${cleanHost}/v3/seedream-5.0-lite`
    },
    isAsync: false, // Seedream 5.0 lite is synchronous (returns images directly)
    supportsEdit: true,
    imageInputField: 'image',
    imageInputFormat: 'base64-array',
  },
}

/**
 * 7. OpenAI GPT Image (gpt-image-1, gpt-image-1-mini, gpt-image-1.5)
 * API: POST /v1/images/generations (txt2img, sync, returns JSON with b64_json)
 * Edit: POST /v1/images/edits (img2img, JSON with images[].image_url for base64)
 */
export const MODEL_OPENAI_GPT_IMAGE: ImageModelConfig = {
  toolDefinition: {
    name: 'generate_image',
    description: 'Generate or edit an image using OpenAI GPT Image model. When the user provides images, it will automatically switch to edit mode. Creates high-quality images from text descriptions with excellent instruction following and text rendering.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'A detailed description of the image to generate. Be specific about subjects, style, composition, and text to render. Max 32,000 characters.',
        },
        size: {
          type: 'string',
          description: 'Image dimensions. NOTE: This parameter is IGNORED in edit mode (when user provides images).',
          enum: ['1024x1024', '1024x1536', '1536x1024', 'auto'],
          default: '1024x1024',
        },
        quality: {
          type: 'string',
          description: 'Rendering quality level.',
          enum: ['low', 'medium', 'high', 'auto'],
          default: 'high',
        },
        background: {
          type: 'string',
          description: 'Background transparency. Use "transparent" for logos/icons.',
          enum: ['auto', 'transparent', 'opaque'],
          default: 'auto',
        },
        output_format: {
          type: 'string',
          description: 'Output image format. Use "png" for transparency support.',
          enum: ['png', 'jpeg', 'webp'],
          default: 'png',
        },
      },
      required: ['prompt'],
    },
  },
  apiConfig: {
    endpoint: (hasImages: boolean, baseHost: string) => {
      const cleanHost = baseHost.replace(/\/$/, '')
      // Avoid duplicating /v1 if already present
      let endpoint: string
      if (cleanHost.endsWith('/v1')) {
        const base = cleanHost.slice(0, -3)
        endpoint = hasImages ? `${base}/v1/images/edits` : `${base}/v1/images/generations`
      } else {
        endpoint = hasImages ? `${cleanHost}/v1/images/edits` : `${cleanHost}/v1/images/generations`
      }
      // Clean up any v1/v1 issues
      return endpoint.replace(/\/v1\/v1\//g, '/v1/')
    },
    isAsync: false,
    supportsEdit: true,
    imageInputField: 'images',
    imageInputFormat: 'openai-image-url',
  },
}

/**
 * 6. Replicate - Generic / Seedream
 * Endpoint: Uses the baseHost directly (configured in settings as .../predictions)
 */
export const MODEL_REPLICATE_GENERIC: ImageModelConfig = {
  // 基本上用replicate时候用户fetch API scheme所以这个generic Config是不会实际用的
  toolDefinition: {
    name: 'generate_image',
    description: 'Generate an image using the specified model.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'A detailed description of the image to generate.',
        },
        width: {
          type: 'number',
          description: 'Image width in pixels',
          default: 1024,
        },
        height: {
          type: 'number',
          description: 'Image height in pixels',
          default: 1024,
        },
        num_inference_steps: {
          type: 'number',
          description: 'Number of inference steps',
          default: 50,
        },
      },
      required: ['prompt'],
    },
  },
  apiConfig: {
    endpoint: (_: boolean, baseHost: string) => baseHost,
    isAsync: true, 
    supportsEdit: false,
  },
}


/**
 * Registry of all available image model configurations
 * Key format: "provider-model" (e.g., "chutes-chroma", "novita-qwen")
 */
export const IMAGE_MODEL_REGISTRY: Record<string, ImageModelConfig> = {
  'chutes-chroma': MODEL_CHUTES_CHROMA,
  'chutes-flux': MODEL_CHUTES_CHROMA, // Alias - uses same format
  'novita-qwen': MODEL_NOVITA_QWEN,
  'novita-hunyuan': MODEL_NOVITA_HUNYUAN,
  'novita-hunyuan-image-3': MODEL_NOVITA_HUNYUAN, // Alias
  'novita-glm': MODEL_NOVITA_GLM,
  'novita-glm-image': MODEL_NOVITA_GLM, // Alias
  'novita-seedream': MODEL_NOVITA_SEEDREAM,
  'novita-seedream-4': MODEL_NOVITA_SEEDREAM, // Alias
  'novita-seedream-4-0': MODEL_NOVITA_SEEDREAM, // Alias
  'novita-seedream-5': MODEL_NOVITA_SEEDREAM_5,
  'novita-seedream-5-0': MODEL_NOVITA_SEEDREAM_5, // Alias
  'novita-seedream-5-0-lite': MODEL_NOVITA_SEEDREAM_5, // Alias
  'openai-gpt-image-1': MODEL_OPENAI_GPT_IMAGE,
  'openai-gpt-image-1-mini': MODEL_OPENAI_GPT_IMAGE,
  'openai-gpt-image-1.5': MODEL_OPENAI_GPT_IMAGE,
}

/**
 * Get image model configuration by key
 * @param key Registry key (e.g., "chutes-chroma", "novita-qwen")
 * @returns Image model configuration, or undefined if not found
 */
export function getImageModelByKey(key: string): ImageModelConfig | undefined {
  return IMAGE_MODEL_REGISTRY[key.toLowerCase()]
}

/**
 * Get default image model configuration for a given model
 * @param model Model identifier (e.g., "chroma", "qwen-image", "hunyuan-image-3")
 * @param provider Optional provider hint (e.g., "chutes", "novita")
 * @returns Image model configuration, or default Chutes standard if not found
 */
export function getDefaultImageModel(model: string, provider?: string): ImageModelConfig {
  const modelLower = model.toLowerCase().replace(/\//g, '-') // Replace slashes with hyphens for key matching
  const providerLower = provider?.toLowerCase() || ''

  // Try exact match first
  const exactKey = providerLower ? `${providerLower}-${modelLower}` : modelLower
  const exact = getImageModelByKey(exactKey)
  if (exact) return exact

  // Pattern matching
  if (modelLower.includes('chroma')) {
    return MODEL_CHUTES_CHROMA
  }
  if (modelLower.includes('qwen')) {
    return MODEL_NOVITA_QWEN
  }
  if (modelLower.includes('hunyuan')) {
    return MODEL_NOVITA_HUNYUAN
  }
  if (modelLower.includes('glm') && !modelLower.includes('chat')) {
    return MODEL_NOVITA_GLM
  }
  if (modelLower.includes('seedream')) {
    // Novita 以外（Replicateなど）の場合は汎用設定を優先
    if (providerLower && !providerLower.includes('novita')) {
      return MODEL_REPLICATE_GENERIC
    }
    // Seedream 5.x は新モデル
    if (modelLower.includes('5')) {
      return MODEL_NOVITA_SEEDREAM_5
    }
    return MODEL_NOVITA_SEEDREAM
  }
  if (modelLower.includes('flux')) {
    return MODEL_CHUTES_CHROMA
  }
  if (modelLower.includes('gpt-image')) {
    return MODEL_OPENAI_GPT_IMAGE
  }

  // Replicate の場合はモデル名が不明でも汎用設定で通す
  if (providerLower.includes('replicate')) {
    return MODEL_REPLICATE_GENERIC
  }

  // No model found - throw error instead of returning arbitrary default
  throw new Error(`Image model configuration not found for model: ${model} (provider: ${provider || 'unknown'})`)
}

/**
 * List of all available image model presets for UI display
 */
export const IMAGE_MODEL_PRESETS = [
  { id: 'chutes-chroma', name: 'Chutes - Chroma', config: MODEL_CHUTES_CHROMA },
  { id: 'novita-qwen', name: 'Novita - Qwen Image', config: MODEL_NOVITA_QWEN },
  { id: 'novita-hunyuan', name: 'Novita - Hunyuan Image 3', config: MODEL_NOVITA_HUNYUAN },
  { id: 'novita-glm', name: 'Novita - GLM Image', config: MODEL_NOVITA_GLM },
  { id: 'novita-seedream', name: 'Novita - Seedream 4.0', config: MODEL_NOVITA_SEEDREAM },
  { id: 'novita-seedream-5', name: 'Novita - Seedream 5.0 lite', config: MODEL_NOVITA_SEEDREAM_5 },
  { id: 'openai-gpt-image-1', name: 'OpenAI - GPT Image 1', config: MODEL_OPENAI_GPT_IMAGE },
]
