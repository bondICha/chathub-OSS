import Browser from 'webextension-polyfill'
import { extractTextFromPDF } from '~utils/pdf-utils'

// PDFテキスト抽出要求を処理
Browser.runtime.onMessage.addListener(async (message, sender) => {
  if (message.type === 'PING_PDF_PROCESSOR') {
    console.log('🏓 Content Script: PDF processor ping received')
    return { ready: true }
  }
  
  if (message.type === 'EXTRACT_PDF_TEXT') {
    console.log('🔍 Content Script: PDF text extraction requested')
    
    try {
      const { pdfData } = message
      const buffer = new Uint8Array(pdfData).buffer
      const extractedText = await extractTextFromPDF(buffer)
      
      return {
        success: true,
        text: extractedText
      }
    } catch (error) {
      console.error('PDF text extraction failed in content script:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
})

console.log('📄 PDF processor content script loaded')