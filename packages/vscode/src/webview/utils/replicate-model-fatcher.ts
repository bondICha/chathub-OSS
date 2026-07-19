import { ApiModel } from './model-fetcher'

export interface ReplicateModelSchema {
  version: {
    id: string
    created_at: string
    cog_version: string
    openapi_schema: {
      title: string
      version: string
      components?: {
        schemas?: {
          Input?: {
            type: string
            properties: Record<string, any>
            required?: string[]
          }
        }
      }
    }
  }
}


/**
 * Fetch a single model's schema and description from Replicate API
 * Uses the correct endpoint: /v1/models/{modelId}
 */
export async function fetchReplicateModelSchema(
  apiKey: string,
  modelId: string
): Promise<{ schema: any; description: string }> {
  try {
    const response = await fetch(`https://api.replicate.com/v1/models/${modelId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const data = await response.json()
    let schema = data.latest_version?.openapi_schema?.components?.schemas?.Input || null
    const description = data.description || ''

    // Resolve $ref references in schema
    if (schema) {
      schema = resolveSchemaReferences(schema, data.latest_version?.openapi_schema?.components?.schemas || {});
    }

    return { schema, description }
  } catch (err) {
    console.error(`[SchemaFetcher] Error fetching schema for ${modelId}:`, err)
    throw new Error(`Failed to fetch schema for ${modelId}: ${err instanceof Error ? err.message : 'Unknown error'}`)
  }
}

/**
 * Resolve $ref references in OpenAPI schema
 */
function resolveSchemaReferences(obj: any, schemas: Record<string, any>): any {
  if (!obj) return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => resolveSchemaReferences(item, schemas));
  }

  if (typeof obj === 'object' && obj !== null) {
    const resolved: any = {};

    for (const [key, value] of Object.entries(obj)) {
      if (key === '$ref' && typeof value === 'string') {
        // Resolve $ref reference (e.g., "#/components/schemas/aspect_ratio")
        const refPath = value;
        if (refPath.startsWith('#/components/schemas/')) {
          const schemaName = refPath.replace('#/components/schemas/', '');
          const referencedSchema = schemas[schemaName];
          if (referencedSchema) {
            // Return the referenced schema instead of the $ref
            Object.assign(resolved, resolveSchemaReferences(referencedSchema, schemas));
            continue;
          }
        }
      } else if (key === 'allOf' && Array.isArray(value)) {
        // Handle allOf arrays - merge all schemas
        const merged: any = { type: 'object', properties: {}, required: [] };
        for (const item of value) {
          const resolvedItem = resolveSchemaReferences(item, schemas);
          if (resolvedItem.type) merged.type = resolvedItem.type;
          if (resolvedItem.properties) Object.assign(merged.properties, resolvedItem.properties);
          if (resolvedItem.required) merged.required.push(...resolvedItem.required);
          if (resolvedItem.enum) merged.enum = resolvedItem.enum;
          if (resolvedItem.default !== undefined) merged.default = resolvedItem.default;
          if (resolvedItem.minimum !== undefined) merged.minimum = resolvedItem.minimum;
          if (resolvedItem.maximum !== undefined) merged.maximum = resolvedItem.maximum;
        }
        return merged; // Return merged object directly, not wrapped in key
      } else {
        // Recursively resolve references in nested objects
        resolved[key] = resolveSchemaReferences(value, schemas);
      }
    }

    return resolved;
  }

  return obj;
}

