import * as pdfjsLib from 'pdfjs-dist';

// PDF.js worker の設定
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

export async function extractTextFromPDF(pdfData: ArrayBuffer): Promise<string> {
  try {
    const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfData) });
    const pdf = await loadingTask.promise;
    
    let fullText = '';
    
    // 各ページからテキストを抽出
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent({
        includeMarkedContent: false
      });
      
      // テキストアイテムを結合
      const pageText = textContent.items
        .map((item) => {
          if ('str' in item) {
            return item.str;
          }
          return '';
        })
        .join(' ');
      
      if (pageText.trim()) {
        fullText += `Page ${pageNumber}:\n${pageText}\n\n`;
      }
    }
    
    return fullText.trim();
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export function isPDFBuffer(buffer: ArrayBuffer): boolean {
  const view = new Uint8Array(buffer);
  // PDFファイルは %PDF- で始まる
  return view.length >= 4 && 
         view[0] === 0x25 && // %
         view[1] === 0x50 && // P
         view[2] === 0x44 && // D
         view[3] === 0x46;   // F
}