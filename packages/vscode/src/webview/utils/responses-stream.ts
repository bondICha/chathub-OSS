export type ResponsesStreamCallbacks = {
  onTextDelta?: (text: string) => void
  onTextFinal?: (text: string) => void
  onReasoningDelta?: (text: string) => void
  onReasoningFinal?: (text: string) => void
  onImagePartial?: (b64: string) => void
  onImageDone?: (b64: string) => void
  onFunctionCall?: (functionCall: { id: string; name: string; arguments: string; call_id: string }) => void
  onCompleted?: () => void
  onCompletedResponse?: (response: any) => void
  onIncomplete?: () => void
  onIncompleteResponse?: (response: any) => void
  onError?: (message: string, raw?: any) => void
}

export function handleResponsesEvent(data: any, eventName: string | undefined, cb: ResponsesStreamCallbacks) {
  if (!data) return
  const t = data.type || eventName
  switch (t) {
    case 'error': {
      const err = data.error || data
      cb.onError?.(err?.message || 'Response stream error', err)
      return
    }
    case 'response.failed': {
      const err = data.response?.error || data.error || data
      cb.onError?.(err?.message || 'Response failed', err)
      return
    }
    case 'response.incomplete': {
      if (data.response) cb.onIncompleteResponse?.(data.response)
      cb.onIncomplete?.()
      return
    }
    case 'response.completed': {
      if (data.response) cb.onCompletedResponse?.(data.response)
      cb.onCompleted?.()
      return
    }
    case 'response.output_text.delta': {
      const delta = data.delta || ''
      if (delta) cb.onTextDelta?.(delta)
      return
    }
    case 'response.output_text.done': {
      const text = data.text || ''
      if (text) cb.onTextFinal?.(text)
      return
    }
    case 'response.refusal.delta': {
      const delta = data.delta || ''
      if (delta) cb.onTextDelta?.(delta)
      return
    }
    case 'response.refusal.done': {
      // no-op
      return
    }
    case 'response.reasoning_summary_text.delta':
    case 'response.reasoning_text.delta': {
      const delta = data.delta || ''
      if (delta) cb.onReasoningDelta?.(delta)
      return
    }
    case 'response.reasoning_summary_text.done':
    case 'response.reasoning_text.done': {
      const text = data.text || ''
      if (text) cb.onReasoningFinal?.(text)
      return
    }
    case 'response.image_generation_call.partial_image': {
      const b64 = data.partial_image_b64
      if (b64) cb.onImagePartial?.(b64)
      return
    }
    case 'response.image_generation_call.done':
    case 'response.image_generation_call.completed':
    case 'image_generation.completed': {
      const b64 = data.result || data.image_b64 || data.image_base64 || data.b64_json
      if (b64) cb.onImageDone?.(b64)
      return
    }
    case 'response.output_item.done': {
      // Handle function calls (for Image Agent integration)
      const item = data.item
      if (item && item.type === 'function_call' && item.status === 'completed') {
        cb.onFunctionCall?.({
          id: item.id,
          name: item.name,
          arguments: item.arguments,
          call_id: item.call_id
        })
      }
      return
    }
    default:
      return
  }
}
