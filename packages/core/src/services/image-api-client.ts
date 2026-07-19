import { ChatError, ErrorCode } from '~utils/errors'

/**
 * Unified image generation API client
 *
 * Handles multiple image generation API patterns:
 * 1. Synchronous (Chutes, Seedream): Direct image binary response
 * 2. Asynchronous Novita: POST → {task_id} → GET task-result → {images: [{image_url}]}
 * 3. Asynchronous Replicate: POST → {id} → GET /predictions/{id} → {output: "url"}
 *
 * EXTENSIBILITY:
 * - To support new providers following existing patterns, no code changes needed
 * - For new API patterns, add a new handler function and detection logic
 */

export interface GenerateImageParams {
  /** API endpoint URL */
  endpoint: string
  /** API key for authentication */
  apiKey: string
  /** Request body (tool call arguments passed directly) */
  body: Record<string, any>
  /** Abort signal for cancellation */
  signal?: AbortSignal
  /** Whether this is an async API (e.g., Novita) */
  isAsync?: boolean
}

/**
 * Generate an image using the specified API
 * @param params Generation parameters
 * @returns Image URL (data URL for sync, regular URL for async)
 */
export async function generateImage(params: GenerateImageParams): Promise<string> {
  const { endpoint, apiKey, body, signal, isAsync } = params

  // Detect API pattern from endpoint
  const isReplicate = endpoint.includes('replicate.com')

  if (isReplicate) {
    // Replicate-style async: create prediction → poll for result
    return await generateImageReplicate(endpoint, apiKey, body, signal)
  } else if (isAsync) {
    // Novita-style async: create task → poll for result
    return await generateImageAsync(endpoint, apiKey, body, signal)
  } else {
    // Chutes-style sync: direct image response
    return await generateImageSync(endpoint, apiKey, body, signal)
  }
}

/**
 * Synchronous image generation (Chutes AI pattern)
 * POST request returns image binary directly
 */
async function generateImageSync(
  endpoint: string,
  apiKey: string,
  body: any,
  signal?: AbortSignal
): Promise<string> {
  const resp = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new ChatError(
      `Image API error ${resp.status}: ${resp.statusText}`,
      ErrorCode.UNKOWN_ERROR,
      text
    )
  }

  // Check if response is JSON (for Seedream) or binary image
  const contentType = resp.headers.get('content-type')
  if (contentType && contentType.includes('application/json')) {
    // Handle JSON response (Seedream pattern)
    const jsonResponse = await resp.json()

    // Extract image from JSON response
    // Handle different response formats

    // OpenAI Images API: { data: [{ b64_json: "..." }] }
    const b64Json = jsonResponse.data?.[0]?.b64_json
    if (b64Json) {
      const fmt = jsonResponse.data[0].output_format || 'png'
      const mime = fmt === 'jpeg' ? 'image/jpeg' : fmt === 'webp' ? 'image/webp' : 'image/png'
      return `data:${mime};base64,${b64Json}`
    }

    // OpenAI Images API: { data: [{ url: "..." }] }
    const dataUrl = jsonResponse.data?.[0]?.url
    if (dataUrl) {
      return dataUrl
    }

    // Seedream/Novita: { images: [{ image_url: "..." }] }
    let imageUrl = jsonResponse.images?.[0]?.image_url
    if (!imageUrl && Array.isArray(jsonResponse.images) && typeof jsonResponse.images[0] === 'string') {
      imageUrl = jsonResponse.images[0]
    }
    if (!imageUrl && jsonResponse.image_url) {
      imageUrl = jsonResponse.image_url
    }

    if (!imageUrl) {
      throw new ChatError(
        'No image data in JSON response',
        ErrorCode.UNKOWN_ERROR,
        JSON.stringify(jsonResponse)
      )
    }

    return imageUrl // Return URL directly
  } else {
    // Handle binary image response (Chutes pattern)
    const blob = await resp.blob()

    if (!blob || blob.size === 0) {
      throw new ChatError('Received empty image from API', ErrorCode.UNKOWN_ERROR)
    }

    return await blobToDataURL(blob)
  }
}

/**
 * Asynchronous image generation (Novita AI pattern)
 * 1. POST request creates a task and returns task_id
 * 2. Poll GET task-result endpoint until status is SUCCEED or FAILED
 */
async function generateImageAsync(
  endpoint: string,
  apiKey: string,
  body: any,
  signal?: AbortSignal
): Promise<string> {
  // Step 1: Create task
  const createResp = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  })

  if (!createResp.ok) {
    const text = await createResp.text().catch(() => '')
    throw new ChatError(
      `Failed to create image generation task: ${createResp.status}`,
      ErrorCode.UNKOWN_ERROR,
      text
    )
  }

  const createData = await createResp.json()
  const taskId = createData.task_id || createData.data?.task_id

  if (!taskId) {
    throw new ChatError(
      'No task_id in API response',
      ErrorCode.UNKOWN_ERROR,
      JSON.stringify(createData)
    )
  }

  // Step 2: Poll for result
  // Extract base host from endpoint (e.g., https://api.novita.ai/v3/async/qwen-image-txt2img → https://api.novita.ai)
  const baseHost = endpoint.split('/v3/')[0]
  const resultUrl = `${baseHost}/v3/async/task-result?task_id=${encodeURIComponent(taskId)}`

  const startTime = Date.now()
  const timeout = 180000 // 3 minutes

  while (Date.now() - startTime < timeout) {
    // Wait before polling
    await new Promise(resolve => setTimeout(resolve, 2000)) // Poll every 2 seconds

    if (signal?.aborted) {
      throw new ChatError('Image generation cancelled', ErrorCode.UNKOWN_ERROR)
    }

    let resultResp
    try {
      resultResp = await fetch(resultUrl, {
        method: 'GET',
        signal,
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })
    } catch (err) {
      // Network error, continue polling
      continue
    }

    if (!resultResp.ok) {
      // Temporary error, continue polling
      continue
    }

    let result
    try {
      result = await resultResp.json()
    } catch (err) {
      // JSON parse error, continue polling
      continue
    }

    const status = result.task?.status

    if (status === 'TASK_STATUS_SUCCEED') {
      const imageUrl = result.images?.[0]?.image_url
      if (!imageUrl) {
        throw new ChatError(
          'No image URL in successful task result',
          ErrorCode.UNKOWN_ERROR,
          JSON.stringify(result)
        )
      }
      return imageUrl // Return URL directly (Novita provides CDN URLs)
    }

    if (status === 'TASK_STATUS_FAILED') {
      const reason = result.task?.reason || 'Unknown error'
      throw new ChatError(
        `Image generation failed: ${reason}`,
        ErrorCode.UNKOWN_ERROR,
        JSON.stringify(result)
      )
    }

    // Status is PENDING, PROCESSING, etc. - continue polling
  }

  throw new ChatError(
    'Image generation timeout (exceeded 3 minutes)',
    ErrorCode.UNKOWN_ERROR
  )
}

/**
 * Asynchronous image generation (Replicate pattern)
 * 1. POST request creates a prediction with input object
 * 2. Poll GET /predictions/{id} endpoint until status is succeeded or failed
 * Note: Using model-specific endpoint (/v1/models/MODEL_ID/predictions), so no version wrapper needed
 */
async function generateImageReplicate(
  endpoint: string,
  apiKey: string,
  body: any,
  signal?: AbortSignal
): Promise<string> {
  // Step 1: Create prediction with Replicate's request format
  // For model-specific endpoints, only send input (no version field)
  const replicateBody = {
    input: { ...body }
  }

  // Remove 'model' field from input if it exists
  delete replicateBody.input.model

  const createResp = await fetch(endpoint, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(replicateBody),
  })

  if (!createResp.ok) {
    const text = await createResp.text().catch(() => '')
    throw new ChatError(
      `Failed to create Replicate prediction: ${createResp.status}`,
      ErrorCode.UNKOWN_ERROR,
      text
    )
  }

  const createData = await createResp.json()
  const predictionId = createData.id

  if (!predictionId) {
    throw new ChatError(
      'No prediction ID in Replicate API response',
      ErrorCode.UNKOWN_ERROR,
      JSON.stringify(createData)
    )
  }

  // Step 2: Poll for result
  // For model-specific endpoint like /v1/models/MODEL_ID/predictions,
  // polling uses generic /v1/predictions/{id}
  const baseUrl = endpoint.includes('/models/')
    ? endpoint.substring(0, endpoint.indexOf('/models/'))
    : endpoint.substring(0, endpoint.lastIndexOf('/predictions'))
  const resultUrl = `${baseUrl}/predictions/${encodeURIComponent(predictionId)}`

  const startTime = Date.now()
  const timeout = 180000 // 3 minutes

  while (Date.now() - startTime < timeout) {
    // Wait before polling
    await new Promise(resolve => setTimeout(resolve, 2000)) // Poll every 2 seconds

    if (signal?.aborted) {
      throw new ChatError('Image generation cancelled', ErrorCode.UNKOWN_ERROR)
    }

    let resultResp
    try {
      resultResp = await fetch(resultUrl, {
        method: 'GET',
        signal,
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })
    } catch (err) {
      // Network error, continue polling
      continue
    }

    if (!resultResp.ok) {
      // Temporary error, continue polling
      continue
    }

    let result
    try {
      result = await resultResp.json()
    } catch (err) {
      // JSON parse error, continue polling
      continue
    }

    const status = result.status

    if (status === 'succeeded') {
      const output = result.output
      let imageUrl: string | undefined

      // Handle different output formats: string (Imagen 4) or array (Hunyuan 3)
      if (typeof output === 'string') {
        imageUrl = output
      } else if (Array.isArray(output) && output.length > 0 && typeof output[0] === 'string') {
        imageUrl = output[0] // Take first image from array
      }

      if (!imageUrl) {
        throw new ChatError(
          'No image URL in successful Replicate prediction result',
          ErrorCode.UNKOWN_ERROR,
          JSON.stringify(result)
        )
      }
      return imageUrl // Return URL directly (Replicate provides CDN URLs)
    }

    if (status === 'failed' || status === 'canceled') {
      const error = result.error || 'Unknown error'
      throw new ChatError(
        `Replicate prediction ${status}: ${error}`,
        ErrorCode.UNKOWN_ERROR,
        JSON.stringify(result)
      )
    }

    // Status is starting, processing, etc. - continue polling
  }

  throw new ChatError(
    'Replicate prediction timeout (exceeded 3 minutes)',
    ErrorCode.UNKOWN_ERROR
  )
}

/**
 * Convert blob to data URL for inline display
 */
async function blobToDataURL(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result === 'string') {
        resolve(result)
      } else {
        reject(new Error('FileReader returned invalid result type'))
      }
    }
    reader.onerror = () => {
      reject(new Error(`FileReader error: ${reader.error}`))
    }
    reader.readAsDataURL(blob)
  })
}
