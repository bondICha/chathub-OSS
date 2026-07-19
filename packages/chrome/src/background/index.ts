import Browser from 'webextension-polyfill'
import { ALL_IN_ONE_PAGE_ID } from '~app/consts'
import { getUserConfig } from '~services/user-config'
import { setupProxyExecutor } from '~services/proxy-fetch'
import { decodeWithHeuristics, isProbablyBinary } from '~utils/content-extractor'
import { StorageMigrationService } from '~services/storage-migration'

/** PDF processing disabled: offscreen queue and related utilities removed */


// expose storage.session to content scripts
// using `chrome.*` API because `setAccessLevel` is not supported by `Browser.*` API
chrome.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS' })

// Setup proxy fetch executor for URL fetching
setupProxyExecutor()

async function openAppPage() {
  const { startupPage } = await getUserConfig()
  let hash = ''
  if (startupPage === ALL_IN_ONE_PAGE_ID) {
    hash = ''
  } else if (startupPage.startsWith('pair_')) {
    hash = `#/?pair=${startupPage}`
  } else {
    hash = `#/chat/${startupPage}`
  }
  await Browser.tabs.create({ url: `app.html${hash}` })
}

Browser.action.onClicked.addListener(() => {
  openAppPage()
})

Browser.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Open welcome page for first-time users
    Browser.tabs.create({ url: 'app.html#/welcome' })
  } else if (details.reason === 'update') {
    // Open app page on extension update
    openAppPage()
  }
})

// Resume migration if service worker was terminated during migration
Browser.runtime.onStartup.addListener(async () => {
  const status = await StorageMigrationService.getMigrationStatus()

  if (status?.status === 'running') {
    console.log('[Background] Detected interrupted migration. Will prompt user on next History page visit.')
    // Reset status to idle so user can retry from UI
    await Browser.storage.local.set({
      'sys:migration:session:v2': {
        ...status,
        status: 'idle',
        updatedAt: Date.now()
      }
    })
  }
})

Browser.commands.onCommand.addListener(async (command) => {
  console.debug(`Command: ${command}`)
  if (command === 'open-app') {
    openAppPage()
  }
})

Browser.runtime.onMessage.addListener(async (message, sender) => {
  console.debug('onMessage', message, sender)
  if (message.target && message.target !== 'background') {
    return
  }
  if (message.type === 'FETCH_URL') {
    console.log('🚀 Background: Fetching URL:', message.url)
    
    try {
      
      const response = await fetch(message.url)
      console.log('📡 Background: Fetch response status:', response.status)
      if (!response.ok) {
        console.log('❌ Background: Fetch failed:', response.status, response.statusText)
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        }
      }
      
      const contentType = response.headers.get('content-type') || ''
      
      // Check if this is a PDF file (disabled)
      if (contentType.includes('application/pdf') || message.url.toLowerCase().endsWith('.pdf')) {
        console.log('📄 Background: PDF detected, but PDF processing is disabled')
        return {
          success: false,
          error: 'PDF content is not supported.',
        }
      }
      
      if (message.responseType === 'arraybuffer') {
        const buffer = await response.arrayBuffer()
        console.log('✅ Background: Fetch success (ArrayBuffer), content length:', buffer.byteLength)
        return {
          success: true,
          content: Array.from(new Uint8Array(buffer)),
          contentType: contentType,
        }
      } else {
        // Get response as ArrayBuffer first to properly handle encoding
        const buffer = await response.arrayBuffer()
        const uint8Array = new Uint8Array(buffer)
        
        // Check if content looks like binary data (PDF, images, etc.)
        const possibleBinary = uint8Array.slice(0, 100).some(byte => byte === 0)
        if (possibleBinary) {
          console.log('⚠️ Background: Binary content detected, returning error')
          return {
            success: false,
            error: 'Binary content detected (PDF, image, or other non-text format). Cannot process as text.',
          }
        }
        
        // Detect charset from multiple sources
        let charset = 'utf-8'
        
        // 1. Check Content-Type header
        const charsetMatch = contentType.match(/charset=([^;]+)/i)
        if (charsetMatch) {
          charset = charsetMatch[1].toLowerCase()
        }
        
        // 2. Try UTF-8 first and check for common encoding issues
        let content: string
        try {
          const decoder = new TextDecoder('utf-8')
          content = decoder.decode(uint8Array)
          
          // 3. Detect if content has meta charset tag with different encoding
          const metaCharsetMatch = content.match(/<meta[^>]*charset\s*=\s*['"]*([^'">]+)/i)
          if (metaCharsetMatch && metaCharsetMatch[1].toLowerCase() !== 'utf-8') {
            const metaCharset = metaCharsetMatch[1].toLowerCase()
            console.log('🔍 Background: Meta charset detected:', metaCharset)
            
            try {
              const metaDecoder = new TextDecoder(metaCharset)
              content = metaDecoder.decode(uint8Array)
              charset = metaCharset
            } catch (metaError) {
              console.warn('Failed to decode with meta charset:', metaCharset)
            }
          }
          
          // 4. Check for mojibake patterns (common encoding mistakes)
          const hasMojibake = /[��]|[\u00C0-\u00FF]{2,}|[\uFFFD]/.test(content.substring(0, 1000))
          if (hasMojibake && charset === 'utf-8') {
            console.log('🔍 Background: Mojibake detected, trying alternative encodings')
            
            // Try common encodings for different regions
            const alternativeEncodings = ['shift_jis', 'euc-jp', 'iso-2022-jp', 'windows-1252', 'iso-8859-1']
            
            for (const encoding of alternativeEncodings) {
              try {
                const altDecoder = new TextDecoder(encoding)
                const altContent = altDecoder.decode(uint8Array)
                const altHasMojibake = /[��]|[\uFFFD]/.test(altContent.substring(0, 1000))
                
                if (!altHasMojibake) {
                  console.log('✅ Background: Fixed encoding with:', encoding)
                  content = altContent
                  charset = encoding
                  break
                }
              } catch (altError) {
                // Continue trying other encodings
              }
            }
          }
          
        } catch (error) {
          // Fallback to UTF-8 if all else fails
          console.warn('Failed to decode, falling back to UTF-8:', error)
          const decoder = new TextDecoder('utf-8')
          content = decoder.decode(uint8Array)
        }
        
        // Check if content looks like PDF (starts with %PDF) - disabled
        if (content.startsWith('%PDF')) {
          console.log('📄 Background: PDF content detected in text response, but PDF processing is disabled')
          return {
            success: false,
            error: 'PDF content is not supported.',
          }
        }
        
        console.log('✅ Background: Fetch success (text), content length:', content.length, 'charset:', charset);
        return {
          success: true,
          content: content,
          contentType: contentType,
        }
      }
    } catch (error) {
      console.log('Background: Fetch error:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  } else if (message.type === 'PROCESS_LOCAL_PDF') {
    console.log('Background: Local PDF processing request rejected (feature disabled)');
    return {
      success: false,
      error: 'PDF processing is disabled.',
    }
  }
});

// Omnibox APIのイベントリスナー
chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  console.log('[background] Omnibox input entered:', text, 'Disposition:', disposition)
  // 検索キーワードをchrome.storage.localに保存
  await Browser.storage.local.set({ pendingOmniboxSearch: text })

  const appUrl = Browser.runtime.getURL('app.html')

  if (disposition === 'currentTab') {
    // 現在アクティブなタブを取得して更新
    const [currentTab] = await Browser.tabs.query({ active: true, currentWindow: true })
    if (currentTab && currentTab.id) {
      await Browser.tabs.update(currentTab.id, { url: appUrl })
    } else {
      // アクティブなタブが見つからない場合は新しいタブで開く（フォールバック）
      await Browser.tabs.create({ url: appUrl })
    }
  } else {
    // 新しいフォアグラウンドタブ、または新しいバックグラウンドタブで開く場合
    // (またはその他の disposition の場合も新しいタブで開く)
    await Browser.tabs.create({ url: appUrl, active: (disposition === 'newForegroundTab') })
  }
})
