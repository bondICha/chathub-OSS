export function htmlToText(html: string): string {
    try {
        // In a browser extension, DOMParser is available.
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');

        // Remove script and style elements
        doc.querySelectorAll('script, style').forEach(el => el.remove());

        const getText = (node: Node): string => {
            if (node.nodeType === Node.TEXT_NODE) {
                // Keep the text content, preserving whitespace.
                return node.textContent || '';
            }

            if (node.nodeType === Node.ELEMENT_NODE) {
                const element = node as Element;
                let text = '';

                // Simple check for block-level elements without relying on window.
                const isBlock = /^(P|DIV|H[1-6]|UL|OL|LI|BLOCKQUOTE|TR|TH|TD|ARTICLE|SECTION|MAIN|HEADER|FOOTER|ASIDE|NAV)$/.test(element.tagName);

                if (isBlock) {
                    text += '\n';
                }

                if (element.tagName === 'A') {
                    let content = '';
                    element.childNodes.forEach(child => {
                        content += getText(child);
                    });
                    // Return only the text content of the link, no URL.
                    return content.trim();
                }
                
                if (element.tagName === 'LI') {
                  text += '• ';
                }

                node.childNodes.forEach(child => {
                    text += getText(child);
                });

                if (isBlock) {
                    text += '\n';
                }
                
                return text;
            }
            return '';
        };

        let rawText = getText(doc.body);

        // Cleanup the extracted text
        return rawText
            .replace(/(\n\s*){3,}/g, '\n\n') // Reduce multiple newlines to a maximum of two.
            .replace(/[ \t]+/g, ' ')         // Condense multiple spaces and tabs into a single space.
            .replace(/\n /g, '\n')           // Remove leading spaces from lines.
            .trim();                         // Remove leading/trailing whitespace.

    } catch (error) {
        console.error("Error parsing HTML:", error);
        // A very basic fallback if DOM parsing fails.
        return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    }
}