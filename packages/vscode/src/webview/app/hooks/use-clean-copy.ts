import { useEffect } from 'react'

export function useCleanCopy() {
  useEffect(() => {
    const handler = (event: ClipboardEvent) => {
      const selection = window.getSelection()
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return

      const range = selection.getRangeAt(0)
      const fragment = range.cloneContents()
      const div = document.createElement('div')
      div.appendChild(fragment)
      div.querySelectorAll<HTMLElement>('*').forEach((el) => {
        el.style.removeProperty('background-color')
        el.style.removeProperty('background')
      })

      event.clipboardData?.setData('text/html', div.innerHTML)
      event.clipboardData?.setData('text/plain', selection.toString())
      event.preventDefault()
    }
    document.addEventListener('copy', handler)
    return () => document.removeEventListener('copy', handler)
  }, [])
}
