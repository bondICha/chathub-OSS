import Browser from 'webextension-polyfill'
import WebSearch, { SearchResult } from './base'

export class BingNewsSearch extends WebSearch {
  async search(query: string): Promise<SearchResult> {
    const html = await this.fetchSerp(query)
    const items = this.extractItems(html)
    return { items }
  }

  private async fetchSerp(query: string) {
    const url = `https://www.bing.com/news/infinitescrollajax?InfiniteScroll=1&q=${encodeURIComponent(query)}`
    const response = await Browser.runtime.sendMessage({
      type: 'FETCH_URL',
      url: url,
    }) as { success: boolean, content?: string }
    
    if (!response.success || !response.content) {
      throw new Error('Failed to fetch Bing News results')
    }
    
    return response.content
  }

  private extractItems(html: string) {
    const dom = new DOMParser().parseFromString(html, 'text/html')
    const nodes = dom.querySelectorAll('.newsitem')
    return Array.from(nodes)
      .slice(0, 10)
      .map((node) => {
        const nodeA = node.querySelector('.title')!
        const link = nodeA.getAttribute('href')!
        const title = nodeA.textContent || ''
        const nodeAbstract = node.querySelector('.snippet')
        const abstract = nodeAbstract?.textContent || ''
        return { title, link, abstract, provider: 'Bing News' }
      })
  }
}
