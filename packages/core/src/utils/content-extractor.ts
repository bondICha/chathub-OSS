/**
 * Utilities to detect binary vs text and decode text with charset heuristics.
 * Reused between background URL fetch and local file processing.
 */

/**
 * A simple heuristic to guess if a file is binary by checking for NUL bytes.
 * @param uint8Array The file content as a byte array.
 * @returns True if the file is likely binary, false otherwise.
 */
export function isProbablyBinary(uint8Array: Uint8Array): boolean {
  const probe = uint8Array.subarray(0, Math.min(512, uint8Array.length));
  for (let i = 0; i < probe.length; i++) {
    if (probe[i] === 0) {
      return true;
    }
  }
  return false;
}

/**
 * Decodes a byte array into a string using various heuristics.
 * It tries to respect Content-Type headers, looks for meta tags in HTML,
 * and attempts to fall back to common encodings if UTF-8 decoding results in mojibake.
 * @param uint8Array The byte array to decode.
 * @param contentTypeHeader Optional Content-Type header string.
 * @returns An object containing the decoded text and the detected charset.
 */
export function decodeWithHeuristics(
  uint8Array: Uint8Array,
  contentTypeHeader?: string,
): { text: string; charset: string } {
  let charset = 'utf-8';

  // 1. Check Content-Type header
  if (contentTypeHeader) {
    const charsetMatch = contentTypeHeader.match(/charset=([^;]+)/i);
    if (charsetMatch) {
      charset = charsetMatch[1].toLowerCase();
    }
  }

  const tryDecode = (encoding: string): string | null => {
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(uint8Array);
    } catch (e) {
      return null;
    }
  };

  // 2. Try the specified charset first
  let content = tryDecode(charset);

  if (content === null) {
    // 3. Fallback to UTF-8
    charset = 'utf-8';
    content = tryDecode(charset);
  }
  
  if (content === null) {
    // If even UTF-8 fails, do a non-fatal decode as a last resort
    content = new TextDecoder().decode(uint8Array);
    return { text: decodeUrlEncodedContent(content), charset: 'unknown' };
  }


  // 4. Detect meta charset tag in HTML
  const metaCharsetMatch = content.match(/<meta[^>]*charset\s*=\s*['"]*([^'">]+)/i);
  if (metaCharsetMatch && metaCharsetMatch[1].toLowerCase() !== charset) {
    const metaCharset = metaCharsetMatch[1].toLowerCase();
    const metaDecodedContent = tryDecode(metaCharset);
    if (metaDecodedContent !== null) {
      return { text: decodeUrlEncodedContent(metaDecodedContent), charset: metaCharset };
    }
  }

  // 5. Check for mojibake patterns if decoded as UTF-8
  if (charset === 'utf-8') {
    const hasMojibake = /[]|[\uFFFD]/.test(content.substring(0, 1000));
    if (hasMojibake) {
      const alternativeEncodings = ['shift_jis', 'euc-jp', 'iso-2022-jp', 'windows-1252', 'iso-8859-1'];
      for (const encoding of alternativeEncodings) {
        const altContent = tryDecode(encoding);
        if (altContent && !/[]|[\uFFFD]/.test(altContent.substring(0, 1000))) {
          return { text: decodeUrlEncodedContent(altContent), charset: encoding };
        }
      }
    }
  }

  return { text: decodeUrlEncodedContent(content), charset };
}

/**
 * Decode URL-encoded sequences like %E3%82%B7 in a string.
 * @param content The string to decode.
 * @returns The decoded string.
 */
export function decodeUrlEncodedContent(content: string): string {
  try {
    return content.replace(/(?:%[0-9A-F]{2})+/gi, (match) => {
      try {
        return decodeURIComponent(match);
      } catch {
        return match;
      }
    });
  } catch (error) {
    console.warn('Failed to decode URL-encoded content:', error);
    return content;
  }
}