import { useAtom } from 'jotai'
import { useEffect, useRef } from 'react'
import { currentSessionNameAtom } from '~app/atoms/all-in-one'
import { generateSessionName, resetTitleBot } from '~services/title-generator'
import { getUserConfig } from '~services/user-config'
import { ChatMessageModel } from '~types'

interface UseSessionNameOptions {
  generating: boolean
  /** All chat panels' messages (multi-bot: multiple arrays, single-bot: one array) */
  getMessages: () => ChatMessageModel[][]
  /** Optional callback after session name is generated */
  onSessionNameGenerated?: (name: string) => void
}

/**
 * Hook for automatic session name generation.
 * Triggers when generating transitions from true → false.
 * Works for both Multi-bot (All-In-One) and Single-bot panels.
 */
export function useSessionNameGenerator({ generating, getMessages, onSessionNameGenerated }: UseSessionNameOptions) {
  const [currentSessionName, setCurrentSessionName] = useAtom(currentSessionNameAtom)

  const prevGeneratingRef = useRef(false)
  const sessionNameGeneratingRef = useRef(false)

  // Store latest values in refs to avoid stale closure
  const currentSessionNameRef = useRef(currentSessionName)
  const getMessagesRef = useRef(getMessages)
  const onSessionNameGeneratedRef = useRef(onSessionNameGenerated)

  // Update refs when values change
  useEffect(() => {
    currentSessionNameRef.current = currentSessionName
  }, [currentSessionName])

  useEffect(() => {
    getMessagesRef.current = getMessages
  }, [getMessages])

  useEffect(() => {
    onSessionNameGeneratedRef.current = onSessionNameGenerated
  }, [onSessionNameGenerated])

  // アンマウント時にタイトル生成Botをリセット
  useEffect(() => {
    return () => { resetTitleBot() }
  }, [])

  useEffect(() => {
    const wasGenerating = prevGeneratingRef.current
    prevGeneratingRef.current = generating

    // generating が true→false に変わった瞬間だけ発火
    if (!wasGenerating || generating) return
    if (sessionNameGeneratingRef.current) return

    sessionNameGeneratingRef.current = true
    const generateName = async () => {
      try {
        const config = await getUserConfig()
        const titleBotIndex = config.titleGenerationBotIndex
        if (titleBotIndex === undefined) return // タイトル生成がオフ

        // 毎回更新モードでなければ、既にセッション名があればスキップ
        if (!config.titleUpdateEveryTurn && currentSessionNameRef.current) return

        const allMessages = getMessagesRef.current()
        if (allMessages.length === 0) return

        // 少なくとも1つのチャットに応答がある
        const hasResponses = allMessages.some(msgs => msgs.length >= 2)
        if (!hasResponses) return

        const name = await generateSessionName(allMessages, titleBotIndex)
        setCurrentSessionName(name)
        onSessionNameGeneratedRef.current?.(name)
      } catch (_error) {
        // Silent failure - session name generation is optional
      } finally {
        sessionNameGeneratingRef.current = false
      }
    }

    generateName()
  }, [generating, setCurrentSessionName])

  // ブラウザタブタイトルをセッション名に同期
  useEffect(() => {
    if (currentSessionName) {
      document.title = `${currentSessionName} - HuddleLLM`
    } else {
      document.title = 'HuddleLLM'
    }
    return () => { document.title = 'HuddleLLM' }
  }, [currentSessionName])

  return currentSessionName
}
