
import { motion } from 'framer-motion'
import { FC, ReactNode, useCallback, useMemo, useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import clearIcon from '~/assets/icons/clear.svg'
import historyIcon from '~/assets/icons/history.svg'
import shareIcon from '~/assets/icons/share.svg'
import { cx } from '~/utils'
import { ConversationContext, ConversationContextValue } from '~app/context'
import { ChatMessageModel } from '~types'
import { BotInstance } from '../../bots'
import { TempChatOverrides } from '~app/bots/abstract-bot'
import Button from '../Button'
import BotIcon from '../BotIcon'
import ShareDialog from '../Share/Dialog'
import Tooltip from '../Tooltip'
import ChatMessageInput from './ChatMessageInput'
import ChatMessageList from './ChatMessageList'
import ChatbotName from './ChatbotName'
import WebAccessCheckbox from './WebAccessCheckbox'
import ChatQuickSettingsPanel from './ChatQuickSettingsPanel'
import { getUserConfig, ProviderConfig } from '~services/user-config'
import { CHATBOTS_UPDATED_EVENT } from '~app/consts'
import { BiSliderAlt } from 'react-icons/bi'

interface Props {
  index: number
  bot: BotInstance
  messages: ChatMessageModel[]
  onUserSendMessage: (input: string, images?: File[], attachments?: { name: string; content: string }[], audioFiles?: File[], videoFiles?: File[], pdfFiles?: File[]) => void
  resetConversation: () => void
  generating: boolean
  stopGenerating: () => void
  onRetry?: (botMessageId: string) => void
  shouldAutoScroll?: boolean
  setAutoScroll?: (shouldAutoScroll: boolean) => void
  mode?: 'full' | 'compact'
  onSwitchBot?: (index: number) => void
  onPropaganda?: (text: string) => Promise<void>
}

const ConversationPanel: FC<Props> = (props) => {
  const { t } = useTranslation()
  const mode = props.mode || 'full'
  const marginClass = 'mx-3'
  const [showShareDialog, setShowShareDialog] = useState(false)
  const [showQuickSettings, setShowQuickSettings] = useState(false)
  const [tempOverrides, setTempOverrides] = useState<TempChatOverrides>({})
  const quickSettingsRef = useRef<HTMLDivElement>(null)
  // ボット名とアバターを保持するための状態を追加
  const [botName, setBotName] = useState<string>('Custom Bot')
  const [botAvatar, setBotAvatar] = useState<string>('OpenAI.Black')
  const [botConfig, setBotConfig] = useState<any>(null)
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfig[]>([])
  const [isInputVisible, setIsInputVisible] = useState(mode !== 'compact')

  // コンポーネントマウント時に設定を取得
  useEffect(() => {
    const reloadBotInfo = async () => {
      const config = await getUserConfig();
      const customApiConfigs = config.customApiConfigs || [];
      setProviderConfigs(config.providerConfigs || []);

      // インデックスが有効な範囲内かどうかを確認
      if (props.index >= 0 && props.index < customApiConfigs.length) {
        const currentBotConfig = customApiConfigs[props.index];
        setBotName(currentBotConfig.name);
        setBotConfig(currentBotConfig);
        // アバター情報も設定
        if (currentBotConfig.avatar) {
          setBotAvatar(currentBotConfig.avatar);
        }
      } else {
        setBotConfig(null);
      }
    };

    const handleBotSettingsUpdated = () => {
      reloadBotInfo();
    };

    reloadBotInfo();
    window.addEventListener(CHATBOTS_UPDATED_EVENT, handleBotSettingsUpdated);

    return () => {
      window.removeEventListener(CHATBOTS_UPDATED_EVENT, handleBotSettingsUpdated);
    };
  }, [props.index]); // props.index が変更されたときに再実行

  const context: ConversationContextValue = useMemo(() => {
    return {
      reset: props.resetConversation,
    }
  }, [props.resetConversation])

  const onSubmit = useCallback(
    async (input: string, images?: File[], attachments?: { name: string; content: string }[], audioFiles?: File[], videoFiles?: File[], pdfFiles?: File[]) => {
      props.onUserSendMessage(input, images, attachments, audioFiles, videoFiles, pdfFiles)
    },
    [props],
  )

  // Assistantメッセージの位置を監視して、上部が画面トップに到達したらスクロールを停止
  useEffect(() => {
    if (!props.generating || !props.shouldAutoScroll || !props.setAutoScroll) {
      return
    }

    // 最新のアシスタントメッセージ要素を取得
    const messages = props.messages
    if (messages.length < 2) return // 少なくともユーザーとAssistantのメッセージが必要

    const lastAssistantMessage = [...messages].reverse().find(msg => msg.author !== 'user')
    if (!lastAssistantMessage) return

    // DOM要素を取得
    const assistantElement = document.getElementById(lastAssistantMessage.id)
    if (!assistantElement) return

    const container = assistantElement.closest('.custom-scrollbar') as HTMLElement
    if (!container) return

    // Intersection Observer を使用して要素の交差を監視
    // 画面の高さの15%を余裕として設定
    const margin = window.innerHeight * 0.15
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          // 要素の上部がコンテナの上部からmarginの位置に到達したら停止
          if (entry.boundingClientRect.top <= entry.rootBounds!.top + margin) {
            props.setAutoScroll!(false)
          }
        })
      },
      { root: container }
    )

    observer.observe(assistantElement)

    // クリーンアップ
    return () => {
      observer.disconnect()
    }
  }, [props.generating, props.messages, props.shouldAutoScroll, props.setAutoScroll])

  const resetConversation = useCallback(() => {
    if (!props.generating) {
      props.resetConversation()
    }
  }, [props])

  const openHistory = useCallback(() => {
    window.location.hash = '#/history?tab=individual'
  }, [])

  const openShareDialog = useCallback(() => {
    setShowShareDialog(true)
  }, [props.index])

  const handleTempOverridesChange = useCallback((overrides: TempChatOverrides) => {
    ;(props.bot as any).setTemporaryOverrides(overrides)
    setTempOverrides(overrides)
  }, [props.bot])

  let inputActionButton: ReactNode = null
  if (props.generating) {
    inputActionButton = (
      <Button text={t('Stop')} color="flat" size={mode === 'full' ? 'normal' : 'tiny'} onClick={props.stopGenerating} />
    )
  } else if (mode === 'full') {
    inputActionButton = (
      <div className="flex flex-row items-center gap-[10px] shrink-0">
        <Button text={t('Send')} color="primary" type="submit" />
      </div>
    )
  }

  return (
    <ConversationContext.Provider value={context}>
      <div className={cx('flex flex-col overflow-hidden bg-primary-background h-full rounded-2xl')}>
        <div
          className={cx(
            'border-b border-solid border-primary-border flex flex-row items-center py-[10px]',
            marginClass,
          )}
        >
          {/* 左側：フレキシブル領域（アイコン + ボット名 + モデル名 + スペーサー） */}
          <div className="flex flex-row items-center min-w-0 flex-1 gap-2">
            <motion.div
              className="flex-shrink-0"
              whileHover={{ rotate: 180 }}
            >
              <BotIcon
                iconName={botAvatar}
                size={18}
                className="object-contain rounded-sm"
              />
            </motion.div>
            <ChatbotName
              index={props.index}
              name={props.bot.chatBotName ?? botName}
              fullName={props.bot.name}
              model={props.bot.modelName ?? 'Default'}
              onSwitchBot={mode === 'compact' ? (index) => props.onSwitchBot?.(index) : undefined}
              botConfig={botConfig}
              providerConfigs={providerConfigs}
            />
          </div>
          
          {/* 右側：固定領域（Web検索 + ボタン群） */}
          <div className="flex flex-row items-center gap-3 flex-shrink-0">
            <WebAccessCheckbox index={props.index} />
            {/* Quick Settings balloon */}
            <div ref={quickSettingsRef} className="relative">
              <Tooltip content={t('Quick Settings')}>
                <motion.div
                  className="w-5 h-5 cursor-pointer flex items-center justify-center opacity-70 hover:opacity-100"
                  onClick={() => setShowQuickSettings((v) => !v)}
                  whileHover={{ scale: 1.1 }}
                >
                  <BiSliderAlt size={18} />
                </motion.div>
              </Tooltip>
              {showQuickSettings && (
                <ChatQuickSettingsPanel
                  botConfig={botConfig}
                  providerConfigs={providerConfigs}
                  currentOverrides={tempOverrides}
                  onClose={() => setShowQuickSettings(false)}
                  onOverridesChange={handleTempOverridesChange}
                />
              )}
            </div>
            <Tooltip content={t('Share conversation')}>
              <motion.img
                src={shareIcon}
                className="w-5 h-5 cursor-pointer"
                onClick={openShareDialog}
                whileHover={{ scale: 1.1 }}
              />
            </Tooltip>
            <Tooltip content={t('Clear conversation')}>
              <motion.img
                src={clearIcon}
                className={cx('w-5 h-5', props.generating ? 'cursor-not-allowed' : 'cursor-pointer')}
                onClick={resetConversation}
                whileHover={{ scale: 1.1 }}
              />
            </Tooltip>
            <Tooltip content={t('View history')}>
              <motion.img
                src={historyIcon}
                className="w-5 h-5 cursor-pointer"
                onClick={openHistory}
                whileHover={{ scale: 1.1 }}
              />
            </Tooltip>
          </div>
        </div>
        <ChatMessageList
          index={props.index}
          messages={props.messages}
          className=""
          onPropaganda={props.onPropaganda}
          onRetry={props.onRetry}
          shouldAutoScroll={props.shouldAutoScroll}
          setAutoScroll={props.setAutoScroll}
        />
        <div
          className={cx(
            'flex flex-col transition-all duration-300 ease-in-out',
            marginClass,
            mode === 'full' && 'mt-3 mb-3',
            mode === 'compact' && (isInputVisible ? 'mt-3 mb-[5px]' : 'mb-[5px]'),
          )}
        >
          <div
            className={cx(
              'flex flex-row items-center gap-[5px]',
              mode === 'full' ? 'mb-3' : 'mb-0',
              mode === 'compact' && !isInputVisible && 'hidden',
            )}
          >
            {mode === 'compact' && (
              <span className="font-medium text-xs text-light-text cursor-default">Send to {botName}</span>
            )}
            <hr className="grow border-primary-border" />
          </div>
          <ChatMessageInput
            mode={mode}
            disabled={props.generating}
            placeholder={
              mode === 'compact' && !isInputVisible ? `Send a message to ${botName}...` : mode === 'compact' ? '' : undefined
            }
            onSubmit={onSubmit}
            autoFocus={mode === 'full'}
            supportImageInput={true || props.bot.supportsImageInput}
            supportAudioInput={props.bot.supportsAudioInput}
            actionButton={inputActionButton}
            onVisibilityChange={mode === 'compact' ? setIsInputVisible : undefined}
            className={cx(
              mode === 'compact' && !isInputVisible && 'bg-transparent border-b border-primary-border rounded-none',
            )}
          />
        </div>
      </div>
      {showShareDialog && (
        <ShareDialog open={true} onClose={() => setShowShareDialog(false)} messages={props.messages} />
      )}
    </ConversationContext.Provider>
  )
}

export default ConversationPanel
