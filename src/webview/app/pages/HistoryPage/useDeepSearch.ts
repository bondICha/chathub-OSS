import { useEffect, useRef, useState } from 'react'
import { getSessionFullText } from '~services/chat-history'
import type { AnyMeta, SessionListItem } from './types'

export type DeepSearchResult = {
  /** クエリ(lowercase) → マッチしたsessionKeyのSet。'__done__'マーカーで完了済みクエリを判別。 */
  deepMatches: Map<string, Set<string>>
  /** スキャン進捗。null時は非表示。 */
  searchProgress: { total: number; scanned: number } | null
}

export type UseDeepSearchParams = {
  /** 検索クエリ。空文字なら検索しない。 */
  query: string
  /** 検索対象のセッション一覧（タブで絞ったもの）。プレビュー一致は呼び元で別途処理する想定。 */
  baseItems: SessionListItem[]
  /** sessionKey → メタ取得関数。getSessionFullText に渡すメタを解決するために使う。 */
  getMeta: (sessionKey: string) => AnyMeta | undefined
  /** 値が変わると内部キャッシュ(deepMatches / fullText)をリセットする。タブ切替やセッション再読込で利用。 */
  resetKey: unknown
}

/**
 * セッション本文を遅延ロードしながら検索する Deep Search フック。
 * - 200ms デバウンスでクエリ変化に追従
 * - 20件チャンクで段階的に処理し、進捗ごとに UI 反映
 * - フルテキストはキャッシュ。resetKey 変化でクリア。
 * - 完了済みクエリは再走しない（Setに '__done__' を入れて検出）
 */
export function useDeepSearch(params: UseDeepSearchParams): DeepSearchResult {
  const { query, baseItems, getMeta, resetKey } = params

  const [deepMatches, setDeepMatches] = useState<Map<string, Set<string>>>(new Map())
  const deepMatchesRef = useRef<Map<string, Set<string>>>(new Map())
  const [searchProgress, setSearchProgress] = useState<{ total: number; scanned: number } | null>(null)
  const fullTextCacheRef = useRef<Map<string, string>>(new Map())

  // deepMatches state と ref を同期（useEffect 内で最新値を参照するため）
  useEffect(() => {
    deepMatchesRef.current = deepMatches
  }, [deepMatches])

  // resetKey が変わったら検索キャッシュをクリア
  useEffect(() => {
    setDeepMatches(new Map())
    deepMatchesRef.current = new Map()
    fullTextCacheRef.current = new Map()
    setSearchProgress(null)
  }, [resetKey])

  useEffect(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      setSearchProgress(null)
      return
    }
    // すでにスキャン完了済みなら再走させない
    const cached = deepMatchesRef.current.get(q)
    if (cached && cached.has('__done__')) {
      setSearchProgress(null)
      return
    }

    const token = { aborted: false }
    let timeoutId: number | undefined

    const runDeepSearch = async () => {
      // プレビュー文字列に一致しないアイテムだけがスキャン対象（呼び元の責務だがフォールバック）
      const candidates = baseItems.filter((s) => !s._searchString.includes(q))
      if (candidates.length === 0) {
        const empty = new Set<string>(['__done__'])
        setDeepMatches((prev) => new Map(prev).set(q, empty))
        setSearchProgress(null)
        return
      }

      const found = new Set<string>()
      let scanned = 0
      setSearchProgress({ total: candidates.length, scanned })

      const CHUNK = 20
      for (let i = 0; i < candidates.length; i += CHUNK) {
        if (token.aborted) return
        const chunk = candidates.slice(i, i + CHUNK)

        const texts = await Promise.all(
          chunk.map(async (item) => {
            const cached = fullTextCacheRef.current.get(item._sessionKey)
            if (cached !== undefined) return cached
            const meta = getMeta(item._sessionKey)
            if (!meta) return ''
            try {
              const text = await getSessionFullText(meta)
              fullTextCacheRef.current.set(item._sessionKey, text)
              return text
            } catch {
              fullTextCacheRef.current.set(item._sessionKey, '')
              return ''
            }
          }),
        )

        if (token.aborted) return

        chunk.forEach((item, idx) => {
          if (texts[idx] && texts[idx].toLowerCase().includes(q)) {
            found.add(item._sessionKey)
          }
        })

        scanned = Math.min(scanned + CHUNK, candidates.length)
        setSearchProgress({ total: candidates.length, scanned })
        setDeepMatches((prev) => new Map(prev).set(q, new Set(found)))

        // UI に譲る
        await new Promise((resolve) => setTimeout(resolve, 0))
      }

      if (token.aborted) return
      found.add('__done__')
      setDeepMatches((prev) => new Map(prev).set(q, found))
      setSearchProgress(null)
    }

    // 200ms デバウンス
    timeoutId = window.setTimeout(runDeepSearch, 200)
    return () => {
      token.aborted = true
      if (timeoutId !== undefined) clearTimeout(timeoutId)
    }
    // deepMatches を依存に入れない（自身で更新するため無限ループ回避）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, baseItems, getMeta])

  return { deepMatches, searchProgress }
}
