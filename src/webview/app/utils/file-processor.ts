import { isProbablyBinary, decodeWithHeuristics } from '~utils/content-extractor';

export type ProcessedFileResult =
  | { type: 'text'; content: string; file: File; warning?: { key: string; params: Record<string, string> } }
  | { type: 'image'; file: File; warning?: { key: string; params: Record<string, string> } }
  | { type: 'audio'; file: File; warning?: { key: string; params: Record<string, string> } }
  | { type: 'video'; file: File; warning?: { key: string; params: Record<string, string> } }
  | { type: 'pdf'; file: File }
  | { type: 'unsupported'; file: File; error: UnsupportedFileError };

export type UnsupportedFileError =
  | { code: 'unsupported_audio_format'; info: { mimeType: string; supported: string } }
  | { code: 'pdf_not_supported' }
  | { code: 'binary_not_supported' }
  | { code: 'process_failed'; info: { message: string } };

const supportedAudioExtensions = ['wav', 'mp3', 'aiff', 'aac', 'ogg', 'flac', 'm4a'];
const supportedAudioMimeTypes = [
  // Based on Gemini Support (plus common aliases)
    'audio/wav', 'audio/mp3', 'audio/mpeg',
    'audio/aiff', 'audio/aac', 'audio/ogg', 'audio/flac',
    'audio/m4a', 'audio/x-m4a'
];

const supportedVideoExtensions = ['mp4', 'mpeg', 'mpg', 'mov', 'avi', 'wmv', 'webm', '3gp'];
const supportedVideoMimeTypes = [
  'video/mp4', 'video/mpeg', 'video/quicktime',
  'video/x-msvideo', 'video/x-ms-wmv', 'video/webm', 'video/3gpp'
];

async function readAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

function getAudioExtension(filename: string): string | null {
  const ext = filename.toLowerCase().match(/\.([^.]+)$/)?.[1];
  return ext && supportedAudioExtensions.includes(ext) ? ext : null;
}

function getVideoExtension(filename: string): string | null {
  const ext = filename.toLowerCase().match(/\.([^.]+)$/)?.[1];
  return ext && supportedVideoExtensions.includes(ext) ? ext : null;
}

export async function processFile(file: File): Promise<ProcessedFileResult> {
  if (file.type.startsWith('image/')) {
    return { type: 'image', file };
  }

  // Priority 1: Check MIME type if set
  if (file.type.startsWith('audio/')) {
    const isSupportedMime = supportedAudioMimeTypes.some(fmt =>
      file.type === fmt || file.type.startsWith(fmt)
    );
    if (!isSupportedMime) {
      // Show warning but accept the file
      const audioExt = getAudioExtension(file.name);
      return {
        type: 'audio',
        file,
        warning: {
          key: 'audio_warning_uncommon_format',
          params: { type: file.type, ext: audioExt || 'unknown' }
        },
      };
    }
    return { type: 'audio', file };
  }

  // Priority 2: Fallback to extension check only if MIME type is unknown/generic
  const audioExt = getAudioExtension(file.name);
  if ((!file.type || file.type === 'application/octet-stream') && audioExt) {
    return {
      type: 'audio',
      file,
      warning: {
        key: 'audio_warning_extension_fallback',
        params: { ext: audioExt }
      },
    };
  }

  // Video detection: Priority 1 - MIME type
  if (file.type.startsWith('video/')) {
    const isSupportedMime = supportedVideoMimeTypes.some(fmt =>
      file.type === fmt || file.type.startsWith(fmt)
    );
    if (!isSupportedMime) {
      const videoExt = getVideoExtension(file.name);
      return {
        type: 'video',
        file,
        warning: {
          key: 'video_warning_uncommon_format',
          params: { type: file.type, ext: videoExt || 'unknown' }
        },
      };
    }
    return { type: 'video', file };
  }

  // Video detection: Priority 2 - extension fallback
  const videoExt = getVideoExtension(file.name);
  if ((!file.type || file.type === 'application/octet-stream') && videoExt) {
    return {
      type: 'video',
      file,
      warning: {
        key: 'video_warning_extension_fallback',
        params: { ext: videoExt }
      },
    };
  }

  try {
    const buffer = await readAsArrayBuffer(file);

    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      return { type: 'pdf', file };
    }

    if (isProbablyBinary(new Uint8Array(buffer))) {
      return {
        type: 'unsupported',
        file,
        error: { code: 'binary_not_supported' },
      };
    }

    const { text } = decodeWithHeuristics(new Uint8Array(buffer), file.type);
    const content = `Text Document: ${file.name}\n\n${text}`;
    return { type: 'text', content, file };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      type: 'unsupported',
      file,
      error: { code: 'process_failed', info: { message } },
    };
  }
}
