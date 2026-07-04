import { htmlToText } from '~app/utils/html-utils';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useEffect, useMemo, useState } from 'react'
import Browser from 'webextension-polyfill'
import { chatFamily, sessionToRestoreAtom, allInOneRestoreDataAtom } from '~app/state'
import { compressImageFile } from '~app/utils/image-compression'
import { setConversationMessages, loadHistoryMessages } from '~services/chat-history'
import { ChatMessageModel, FetchedUrlContent } from '~types'
import { uuid } from '~utils'
import { ChatError } from '~utils/errors'
import toast from 'react-hot-toast'
import i18n from '~app/i18n'

export function useChat(index: number, page: string = 'singleton') {
  console.log(`useChat called with index:`, index, `(type: ${typeof index})`);
  const chatAtom = useMemo(() => chatFamily({ index, page }), [index, page])
  const [chatState, setChatState] = useAtom(chatAtom)

  const sessionToRestore = useAtomValue(sessionToRestoreAtom)
  const setSessionToRestore = useSetAtom(sessionToRestoreAtom)
  const allInOneRestoreData = useAtomValue(allInOneRestoreDataAtom)
  const setAllInOneRestoreData = useSetAtom(allInOneRestoreDataAtom)

  const updateMessage = useCallback(
    (messageId: string, updater: (message: ChatMessageModel) => void) => {
      setChatState((draft) => {
        const message = draft.messages.find((m) => m.id === messageId)
        if (message) {
          updater(message)
        }
      })
    },
    [setChatState],
  )

  const setAutoScroll = useCallback(
    (shouldAutoScroll: boolean) => {
      setChatState((draft) => {
        draft.shouldAutoScroll = shouldAutoScroll
      })
    },
    [setChatState],
  )

  const sendMessage = useCallback(
    async (
      input: string,
      images?: File[],
      attachments?: { name: string; content: string }[],
      audioFiles?: File[],
      videoFiles?: File[],
      pdfFiles?: File[],
      contextPrefix?: string,
      retryBotMessageId?: string,
    ) => {
      let cleanInput: string
      let fetchedContent = ''
      let fetchedUrls: FetchedUrlContent[] = []
      let botMessageId: string

      if (retryBotMessageId) {
        // ===== RETRY MODE: 元 user メッセージから入力/添付/fetchedUrls を復元 =====
        const msgs = chatState.messages
        const botIdx = msgs.findIndex((m) => m.id === retryBotMessageId)
        if (botIdx < 0) return
        const userMsg = [...msgs].slice(0, botIdx).reverse().find((m) => m.author === 'user')
        if (!userMsg) return

        input = userMsg.text
        images = userMsg.images
        attachments = userMsg.attachments
        audioFiles = userMsg.audioFiles
        videoFiles = userMsg.videoFiles
        pdfFiles = userMsg.pdfFiles
        cleanInput = input
        fetchedUrls = userMsg.fetchedUrls ?? []
        fetchedContent = fetchedUrls.map((u) => `Content from ${u.url}:\n\n${u.content}\n\n`).join('')
        botMessageId = retryBotMessageId

        updateMessage(botMessageId, (msg) => {
          msg.text = ''
          msg.error = undefined
          msg.thinking = undefined
          msg.searchResults = undefined
          msg.referenceUrls = undefined
        })

        // bot 内部履歴を user メッセージより前に巻き戻す (bot.sendMessage が user msg を追加する)
        const userIdx = msgs.findIndex((m) => m.id === userMsg.id)
        chatState.bot.setConversationHistory({ messages: msgs.slice(0, userIdx) })
      } else {
        // ===== NORMAL MODE =====
        cleanInput = input

        // URL処理
        const urlPattern = /@(https?:\/\/[^\s]+)/g
        const matches = [...input.matchAll(urlPattern)]

        // URLがある場合は取得処理
        if (matches.length > 0) {
        for (const match of matches) {
          const fullMatch = match[0]
          const url = match[1]

          try {
            console.log('🌐 Fetching URL:', url)

            // URLのホストを抽出して権限チェック
            const urlObj = new URL(url)
            const hostPattern = `${urlObj.protocol}//${urlObj.hostname}/*`

            // 権限チェック
            const hasPermission = await Browser.permissions.contains({
              origins: [hostPattern]
            })

            if (!hasPermission) {
              console.log('🔐 Requesting permission for:', hostPattern)
              // ユーザージェスチャー内で権限リクエスト
              const granted = await Browser.permissions.request({
                origins: [hostPattern]
              })

              if (!granted) {
                throw new Error(`Permission denied for ${urlObj.hostname}`)
              }
            }

            // Background scriptにフェッチ依頼を送信
            const response = await Browser.runtime.sendMessage({
              type: 'FETCH_URL',
              url: url
            }) as { success: boolean, content?: string, error?: string, status?: number, statusText?: string }

            if (!response.success) {
              throw new Error(response.error || 'Fetch failed')
            }

            // Response objectを模擬
            const mockResponse = {
              ok: true,
              status: response.status || 200,
              statusText: response.statusText || 'OK',
              text: async () => response.content || '',
              headers: new Map()
            }
            console.log('📡 Response status:', mockResponse.status, mockResponse.statusText)
            console.log('📡 Response headers:', Object.fromEntries(mockResponse.headers.entries()))
            if (mockResponse.ok) {
              const content = await mockResponse.text()
              console.log('🔍 Raw content length:', content.length)
              console.log('🔍 Content preview:', content.substring(0, 500))

              const textContent = htmlToText(content);

              console.log('📝 Processed content length:', textContent.length)

              // UIには制限付きで表示
              const maxDisplayLength = 12000
              const displayContent = textContent.length > maxDisplayLength
                ? textContent.substring(0, maxDisplayLength) + '\n\n[Content truncated - showing first ' + maxDisplayLength + ' of ' + textContent.length + ' characters]'
                : textContent

              // UIには短縮版、AIには全文
              fetchedUrls.push({ url, content: displayContent })
              fetchedContent += `Content from ${url}:\n\n${textContent}\n\n`  // AIには全文
            } else {
              const errorContent = `Error fetching ${url}: ${response.status} ${response.statusText}`
              fetchedUrls.push({ url, content: errorContent })
              fetchedContent += errorContent + '\n\n'
            }
          } catch (error) {
            console.error('💥 Fetch error details:', {
              url: url,
              error: error,
              errorType: error?.constructor?.name,
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
              errorStack: error instanceof Error ? error.stack : undefined,
              timestamp: new Date().toISOString()
            })

            let errorContent = `Error fetching ${url}:\n`
            errorContent += `• Error Type: ${error?.constructor?.name || 'Unknown'}\n`
            errorContent += `• Message: ${error instanceof Error ? error.message : 'Unknown error'}\n`
            errorContent += `• Timestamp: ${new Date().toISOString()}\n`

            fetchedUrls.push({ url, content: errorContent })
            fetchedContent += errorContent + '\n\n'
          }
        }
      }

      // 添付は履歴に残さない。UI用の attachments は message に保持しつつ、保存時に除去する（既存仕様・下部で処理）
      botMessageId = uuid()
      setChatState((draft) => {
        draft.messages.push(
          {
            id: uuid(),
            text: input, // 画面表示用にそのまま保持（ただし履歴保存時にattachmentsは落とす）
            images,
            attachments: attachments && attachments.length ? attachments : undefined,
            audioFiles: audioFiles && audioFiles.length ? audioFiles : undefined,
            videoFiles: videoFiles && videoFiles.length ? videoFiles : undefined,
            pdfFiles: pdfFiles && pdfFiles.length ? pdfFiles : undefined,
            author: 'user',
            fetchedUrls: fetchedUrls.length > 0 ? fetchedUrls : undefined
          },
          { id: botMessageId, text: '', author: index }, // Use index as author
        )
      })
      } // end else (NORMAL MODE)

      // API へ渡す最終メッセージは、ユーザ本文 + 取得URL + 添付を末尾に付加
      // contextPrefixがある場合はAI側にのみ渡す（UIには表示しない）
      let finalMessage = contextPrefix
        ? `${contextPrefix}\n\n---\n\n${cleanInput.trim()}`
        : cleanInput.trim()
      if (fetchedContent) finalMessage += '\n\n' + fetchedContent

      // Wait for bot initialization if needed, then check capabilities
      if ('isInitialized' in chatState.bot) {
        // Wait for AsyncAbstractBot initialization
        while (!(chatState.bot as any).isInitialized) {
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }
      let audioCapable = false;
      if ('supportsAudioInput' in chatState.bot) {
        audioCapable = (chatState.bot as any).supportsAudioInput;
      }

      if (attachments && attachments.length) {
        // For audio-capable bots with audio files, exclude transcript from prompt.
        // Transcript is kept in message.attachments for UI display only.
        const effectiveAttachments =
          audioCapable && audioFiles && audioFiles.length > 0
            ? attachments.filter(att => !att.name.endsWith(' (Transcript)'))
            : attachments;

        if (effectiveAttachments.length > 0) {
          const attachmentSection = effectiveAttachments
            .map(att => `<${att.name}>\n${att.content}\n</${att.name}>`)
            .join('\n\n')
          finalMessage = `${finalMessage}\n\n---\n\n<Attachment>\n\n${attachmentSection}\n\n</Attachment>`
        }
      }

      const abortController = new AbortController()
      setChatState((draft) => {
        draft.generatingMessageId = botMessageId
        draft.abortController = abortController
        draft.shouldAutoScroll = true // 新しいメッセージ送信時に自動スクロールをリセット
      })

      let compressedImages: File[] | undefined = undefined
      if (images && images.length > 0) {
        compressedImages = await Promise.all(images.map(compressImageFile))
      }

      const botModelName = chatState.bot.modelName || chatState.bot.name || 'Unknown'

      const supportsPdf = chatState.bot.supportsPdfInput
      if (pdfFiles && pdfFiles.length > 0 && !supportsPdf) {
        toast(i18n.t('pdf_not_supported_provider', { model: botModelName }), { duration: 5000 })
      }
      const effectivePdfFiles = supportsPdf ? pdfFiles : undefined

      const videoCapable = chatState.bot.supportsVideoInput ?? false;
      if (videoFiles && videoFiles.length > 0 && !videoCapable) {
        toast(i18n.t('video_not_supported_provider', { model: botModelName }), { duration: 5000 })
      }
      const effectiveVideoFiles = videoCapable ? videoFiles : undefined

      const resp = chatState.bot.sendMessage({
        prompt: finalMessage,
        images: compressedImages,
        audioFiles: audioFiles,
        videoFiles: effectiveVideoFiles,
        pdfFiles: effectivePdfFiles,
        signal: abortController.signal,
      });

      try {
        for await (const answer of resp) {
          updateMessage(botMessageId, (message) => {
            message.text = answer.text;
            if (answer.thinking) {
              message.thinking = answer.thinking;
            }
            if (answer.searchResults) {
              message.searchResults = answer.searchResults;
            }
            if (answer.referenceUrls) {
              message.referenceUrls = answer.referenceUrls;
            }
          });
        }
      } catch (err: unknown) {
        if (!abortController.signal.aborted) {
          abortController.abort()
        }
        const error = err as ChatError
        console.error('sendMessage error', error.code, error)
        updateMessage(botMessageId, (message) => {
          message.error = error
        })
        setChatState((draft) => {
          draft.abortController = undefined
          draft.generatingMessageId = ''
        })
      }

      setChatState((draft) => {
        draft.abortController = undefined
        draft.generatingMessageId = ''
        // no-op
      })
    },
    [index, chatState.bot, chatState.messages, setChatState, updateMessage],
  )

  const retryMessage = useCallback(
    (botMessageId: string) => sendMessage('', undefined, undefined, undefined, undefined, undefined, undefined, botMessageId),
    [sendMessage],
  )

  const modifyLastMessage = useCallback(
    async (text: string) => {
      chatState.bot.modifyLastMessage(text)

      // 最後のボットメッセージを見つけて更新
      setChatState((draft) => {
        const lastBotMessage = [...draft.messages].reverse().find(m => m.author === index) // Use index to find bot message
        if (lastBotMessage) {
          lastBotMessage.text = text
        }
      })

    }, [chatState.bot, setChatState])

  const resetConversation = useCallback(() => {
    chatState.bot.resetConversation()
    setChatState((draft) => {
      draft.abortController = undefined
      draft.generatingMessageId = ''
      draft.messages = []
      draft.conversationId = uuid()
      draft.shouldAutoScroll = true // リセット時に自動スクロールを有効化
    })
  }, [chatState.bot, setChatState])

  const stopGenerating = useCallback(() => {
    chatState.abortController?.abort()
    if (chatState.generatingMessageId) {
      updateMessage(chatState.generatingMessageId, (message) => {
        if (!message.text && !message.error) {
          message.text = 'Cancelled'
        }
      })
    }
    setChatState((draft) => {
      draft.generatingMessageId = ''
    })
  }, [chatState.abortController, chatState.generatingMessageId, setChatState, updateMessage])

  // 復元メッセージのサニタイズ: ストレージ経由で非Blobオブジェクトに化けたFile系フィールドを除去
  const sanitizeRestoredMessages = (messages: ChatMessageModel[]): ChatMessageModel[] =>
    messages.map((m) => ({
      ...m,
      images: m.images?.filter((img) => img instanceof Blob) as File[] | undefined,
      audioFiles: m.audioFiles?.filter((f) => f instanceof Blob) as File[] | undefined,
      videoFiles: m.videoFiles?.filter((f) => f instanceof Blob) as File[] | undefined,
      pdfFiles: m.pdfFiles?.filter((f) => f instanceof Blob) as File[] | undefined,
    }))

  // セッション復元の処理
  useEffect(() => {
    const restoreSession = async () => {
      if (sessionToRestore && sessionToRestore.type === 'single' && sessionToRestore.botIndex === index) {
        try {
          const conversations = await loadHistoryMessages(index)
          const targetConversation = conversations.find(c => c.id === sessionToRestore.conversationId)

          if (targetConversation && targetConversation.messages.length > 0) {
            const messagesToUse = sanitizeRestoredMessages(targetConversation.messages)
            setChatState((draft) => {
              draft.messages = messagesToUse
              draft.conversationId = targetConversation.id
            })

            // ボットに会話履歴を設定
            if (chatState.bot.setConversationHistory) {
              chatState.bot.setConversationHistory({
                messages: messagesToUse
              })
            }

            // セッション復元完了後、atomをクリア
            setSessionToRestore(null)
          }
        } catch (error) {
          console.error('Failed to restore session:', error)
        }
      }
    }

    restoreSession()
  }, [sessionToRestore, index, setChatState, chatState.bot, setSessionToRestore])

  // All-in-one復元データの監視
  useEffect(() => {
    const restoreAllInOneData = async () => {
      if (allInOneRestoreData && allInOneRestoreData[index]) {
        try {
          const restoreInfo = allInOneRestoreData[index]

          // スナップショット復元の場合: chat history に同IDの会話があれば
          // そちらを優先（復元後にユーザが追加した発言を巻き戻さないため）
          if (restoreInfo.conversationId.startsWith('snapshot-')) {
            if (restoreInfo.messages && restoreInfo.messages.length > 0) {
              const conversations = await loadHistoryMessages(index)
              const existing = conversations.find(c => c.id === restoreInfo.conversationId)
              const rawMessages = (existing && existing.messages.length >= restoreInfo.messages.length)
                ? existing.messages
                : restoreInfo.messages
              const messagesToUse = sanitizeRestoredMessages(rawMessages)

              setChatState((draft) => {
                draft.messages = messagesToUse
                draft.conversationId = restoreInfo.conversationId
              })

              if (chatState.bot.setConversationHistory) {
                chatState.bot.setConversationHistory({ messages: messagesToUse })
              }
            }
          } else {
            // 既存の会話履歴から復元（従来の方法）
            const conversations = await loadHistoryMessages(index)
            const targetConversation = conversations.find(c => c.id === restoreInfo.conversationId)

            if (targetConversation && targetConversation.messages.length > 0) {
              const messagesToUse = sanitizeRestoredMessages(targetConversation.messages)

              setChatState((draft) => {
                draft.messages = messagesToUse
                draft.conversationId = targetConversation.id
              })

              // ボットに会話履歴を設定
              if (chatState.bot.setConversationHistory) {
                chatState.bot.setConversationHistory({
                  messages: messagesToUse
                })
              }
            }
          }
        } catch (error) {
          console.error(`Failed to restore All-in-one data for bot ${index}:`, error)
        }
      }
    }

    restoreAllInOneData()
  }, [allInOneRestoreData, index, setChatState, chatState.bot])

  useEffect(() => {
    if (chatState.messages.length) {
      // 履歴保存時に添付とオーディオを除去（画像同様、添付テキストは残さない）
      const sanitized = chatState.messages.map(({ attachments, audioFiles, videoFiles, ...rest }) => rest)
      setConversationMessages(index, chatState.conversationId, sanitized as ChatMessageModel[])
    }
  }, [index, chatState.conversationId, chatState.messages])

  // AsyncAbstractBotの初期化状態を監視するためのstate
  const [botInitialized, setBotInitialized] = useState(false)

  // ボットの初期化状態を定期的にチェック
  useEffect(() => {
    if ('isInitialized' in chatState.bot) {
      const checkInitialization = () => {
        const initialized = chatState.bot.isInitialized
        if (initialized !== botInitialized) {
          setBotInitialized(initialized)
        }
      }

      // 初期チェック
      checkInitialization()

      // 定期的にチェック（初期化完了まで）
      const interval = setInterval(() => {
        checkInitialization()
        if (chatState.bot.isInitialized) {
          clearInterval(interval)
        }
      }, 100)

      return () => clearInterval(interval)
    } else {
      setBotInitialized(true) // 通常のAbstractBotの場合は常に初期化済み
    }
  }, [chatState.bot, botInitialized])

  const chat = useMemo(
    () => ({
      index,
      bot: chatState.bot,
      messages: chatState.messages,
      conversationId: chatState.conversationId,
      sendMessage,
      resetConversation,
      generating: !!chatState.generatingMessageId,
      stopGenerating,
      retryMessage,
      modifyLastMessage,
      isInitialized: botInitialized,
      shouldAutoScroll: chatState.shouldAutoScroll,
      setAutoScroll,
    }),
    [
      index,
      chatState.bot,
      chatState.generatingMessageId,
      chatState.messages,
      chatState.conversationId,
      chatState.shouldAutoScroll,
      resetConversation,
      sendMessage,
      stopGenerating,
      retryMessage,
      modifyLastMessage,
      botInitialized,
      setAutoScroll,
    ],
  )

  return chat
}
