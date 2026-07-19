import Browser from 'webextension-polyfill';
import WebSearch, { SearchResult } from './base'

export class GoogleSearch extends WebSearch {
  async search(query: string, signal?: AbortSignal): Promise<SearchResult> {
    console.log('🔍 GoogleSearch: Starting search for query:', query)
    
    try {
      const html = await this.fetchSerp(query)
      console.log('📄 GoogleSearch: HTML fetched, length:', html.length)
      console.log('📄 GoogleSearch: HTML preview (first 500 chars):', html.substring(0, 500))
      
      const items = this.extractItems(html)
      console.log('📋 GoogleSearch: Extracted items count:', items.length)
      console.log('📋 GoogleSearch: Items preview:', items.slice(0, 3))
      
      return { items }
    } catch (error) {
      console.error('❌ GoogleSearch: Search failed:', error)
      throw error
    }
  }

  private async fetchSerp(query: string) {
    const url = new URL('https://www.google.com/search')
    url.searchParams.set('q', query)
    
    console.log('🌐 GoogleSearch: Fetching URL:', url.toString())

    const response = await Browser.runtime.sendMessage({
      type: 'FETCH_URL',
      url: url.toString(),
    }) as { success: boolean; content?: string; error?: string };

    console.log('📡 GoogleSearch: Response status:', response.success)
    if (response.error) {
      console.error('❌ GoogleSearch: Fetch error:', response.error)
    }
    if (response.content) {
      console.log('📄 GoogleSearch: Content type check - starts with:', response.content.substring(0, 100))
    }

    if (!response.success || !response.content) {
      throw new Error(response.error || 'Failed to fetch Google search results');
    }

    return response.content;
  }

  private extractItems(html: string) {
    console.log('🔍 GoogleSearch: Starting item extraction')
    
    const dom = new DOMParser().parseFromString(html, 'text/html');
    const nodes = dom.querySelectorAll('div[data-hveid]');
    
    console.log('📋 GoogleSearch: Found nodes with data-hveid:', nodes.length)
    
    // より多くのセレクターを試行
    if (nodes.length === 0) {
      console.log('⚠️ GoogleSearch: No data-hveid nodes found, trying alternative selectors')
      const altNodes1 = dom.querySelectorAll('div.g');
      const altNodes2 = dom.querySelectorAll('div[data-ved]');
      const altNodes3 = dom.querySelectorAll('.MjjYud');
      console.log('📋 GoogleSearch: Alternative selectors found:', {
        'div.g': altNodes1.length,
        'div[data-ved]': altNodes2.length, 
        '.MjjYud': altNodes3.length
      })
    }

    const results = Array.from(nodes)
      .map((node, index) => {
        const linkNode = node.querySelector('a');
        const link = linkNode?.getAttribute('href') || '';
        const titleNode = node.querySelector('h3');
        const title = titleNode?.textContent || '';

        console.log(`📋 GoogleSearch: Processing node ${index}:`, { title: title.substring(0, 50), link: link.substring(0, 100) })

        if (!link || !title || !link.startsWith('http')) {
          console.log(`⚠️ GoogleSearch: Skipping node ${index} - invalid link or title`)
          return null;
        }

        return { title, link, abstract: '', provider: 'Google' };
      })
      .filter((item) => item !== null) as SearchResult['items'];

    console.log('✅ GoogleSearch: Final results count:', results.length)
    return results;
  }
}
