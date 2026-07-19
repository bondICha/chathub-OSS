import { FC, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import Button from '~app/components/Button'
import Dialog from '~app/components/Dialog'
import settingScreenshot from '~assets/setting-button-screenshot.png'

const WelcomePage: FC = () => {
  const navigate = useNavigate()
  const [showSettingsGuidance, setShowSettingsGuidance] = useState(false)
  
  // Get browser language and determine text language
  const texts = useMemo(() => {
    const browserLang = navigator.language.toLowerCase()
    
    if (browserLang.includes('ja')) {
      return {
        title: 'HuddleLLMへようこそ!',
        subtitle: 'オールインワンAIチャットハブ',
        feature1Title: '複数のAIモデル',
        feature1Desc: 'ChatGPT、Claude、Geminiなどを一か所でチャット',
        feature2Title: '並べて比較',
        feature2Desc: '異なるAIモデルの応答を同時に比較',
        feature3Title: 'カスタムAPIサポート',
        feature3Desc: '独自のAPIキーとカスタムエンドポイントを設定',
        feature4Title: 'Propaganda機能 📢',
        feature4Desc: '気に入ったAIの回答を他のAIチャットに伝播させて会話を継続',
        startButtonTitle: 'チャット画面を開く',
        startButton: 'まずはメインのチャット画面がどんな感じかを見てみる',
        setupButtonTitle: '設定画面を開く',
        setupButton: '使い始めるために、AIチャットボットのAPI設定画面を開く',
        note: '設定はいつでもサイドバーからアクセスできます',
        settingsGuidanceTitle: '設定方法について',
        settingsGuidanceText: 'このアプリケーションは<strong>BYOK（Bring Your Own API Key）</strong>の設定後にのみ動作します。<br><br><strong>サイドバーの設定ボタン</strong>から必ず設定を行ってください。',
        settingsGuidanceButton: 'OK、チャット画面を開く'
      }
    } else if (browserLang.includes('zh-cn') || browserLang.includes('zh')) {
      return {
        title: '欢迎使用 HuddleLLM!',
        subtitle: '一体化AI聊天中心',
        feature1Title: '多种AI模型',
        feature1Desc: '在一个地方与ChatGPT、Claude、Gemini等聊天',
        feature2Title: '并排比较',
        feature2Desc: '同时比较不同AI模型的响应',
        feature3Title: '自定义API支持',
        feature3Desc: '配置您自己的API密钥和自定义端点',
        feature4Title: 'Propaganda功能 📢',
        feature4Desc: '将满意的AI回答传播给其他AI聊天以继续对话',
        startButtonTitle: '聊天画面を开く',
        startButton: '首先看看主聊天界面是什么样的',
        setupButtonTitle: '设置画面を开く',
        setupButton: '为了开始使用，打开AI聊天机器人的API设置界面',
        note: '您可以随时从底部按钮访问设置界面',
        settingsGuidanceTitle: '关于设置方法',
        settingsGuidanceText: '此应用程序仅在设置<strong>BYOK（自带API密钥）</strong>后才能工作。<br><br>请务必通过<strong>侧边栏的设置按钮</strong>进行设置。',
        settingsGuidanceButton: 'OK，打开聊天界面'
      }
    } else if (browserLang.includes('zh-tw') || browserLang.includes('zh-hk')) {
      return {
        title: '歡迎使用 HuddleLLM!',
        subtitle: '一體化AI聊天中心',
        feature1Title: '多種AI模型',
        feature1Desc: '在一個地方與ChatGPT、Claude、Gemini等聊天',
        feature2Title: '並排比較',
        feature2Desc: '同時比較不同AI模型的響應',
        feature3Title: '自定義API支持',
        feature3Desc: '配置您自己的API密鑰和自定義端點',
        feature4Title: 'Propaganda功能 📢',
        feature4Desc: '將滿意的AI回答傳播給其他AI聊天以繼續對話',
        startButtonTitle: '聊天畫面を開く',
        startButton: '首先看看主聊天界面是什麼樣的',
        setupButtonTitle: '設置畫面を開く',
        setupButton: '為了開始使用，打開AI聊天機器人的API設置界面',
        note: '您可以隨時從底部按鈕訪問設置界面',
        settingsGuidanceTitle: '關於設置方法',
        settingsGuidanceText: '此應用程序僅在設置<strong>BYOK（自帶API密鑰）</strong>後才能工作。<br><br>請務必通過<strong>側邊欄的設置按鈕</strong>進行設置。',
        settingsGuidanceButton: 'OK，打開聊天界面'
      }
    } else {
      // Default to English
      return {
        title: 'Welcome to HuddleLLM!',
        subtitle: 'Your All-in-One AI Chat Extension',
        feature1Title: 'Multiple AI Models',
        feature1Desc: 'Chat with ChatGPT, Claude, Gemini, and more in one place',
        feature2Title: 'Side-by-Side Comparison',
        feature2Desc: 'Compare responses from different AI models simultaneously',
        feature3Title: 'Custom API Support',
        feature3Desc: 'Configure your own API keys and custom endpoints',
        feature4Title: 'Propaganda Features 📢',
        feature4Desc: 'Propagate satisfying AI responses to other AI chats to continue conversations',
        startButtonTitle: 'Open Chat Screen',
        startButton: 'First, see what the main chat screen looks like',
        setupButtonTitle: 'Open Settings Screen',
        setupButton: 'To get started, open the AI chatbot API settings screen',
        note: 'You can always access settings from the bottom button',
        settingsGuidanceTitle: 'About Settings',
        settingsGuidanceText: 'This application works only after you set up <strong>BYOK (Bring Your Own API Key)</strong>.<br><br>Be sure to setup from settings page from the <strong>settings button in the sidebar</strong>.',
        settingsGuidanceButton: 'OK, Open Chat Screen'
      }
    }
  }, [])

  const handleStartChatting = () => {
    setShowSettingsGuidance(true)
  }

  const handleConfirmStartChatting = () => {
    setShowSettingsGuidance(false)
    navigate({ to: '/' })
  }

  const handleSetupFirst = () => {
    navigate({ to: '/setting' })
  }

  return (
    <div className="min-h-full bg-gradient-to-br from-primary-blue to-primary-purple p-6">
      <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8 text-center mx-auto my-6">
        {/* Logo/Icon */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-2">
            {texts.title}
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300">
            {texts.subtitle}
          </p>
        </div>

        {/* Features */}
        <div className="mb-8 space-y-4">
          <div className="flex items-start text-left space-x-3">
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
              <span className="text-white text-sm">✓</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {texts.feature1Title}
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                {texts.feature1Desc}
              </p>
            </div>
          </div>
          
          <div className="flex items-start text-left space-x-3">
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
              <span className="text-white text-sm">✓</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {texts.feature2Title}
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                {texts.feature2Desc}
              </p>
            </div>
          </div>
          
          <div className="flex items-start text-left space-x-3">
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
              <span className="text-white text-sm">✓</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {texts.feature3Title}
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm">
                {texts.feature3Desc}
              </p>
            </div>
          </div>

          <div className="flex items-start text-left space-x-3">
            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1">
              <span className="text-white text-sm">✓</span>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {texts.feature4Title}
              </h3>
              <p className="text-gray-600 dark:text-gray-300 text-sm mb-2">
                {texts.feature4Desc}
              </p>
              <a 
                href="https://www.youtube.com/watch?v=PZUbT2Id-dI" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1 text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-200 transition-colors text-xs"
              >
                <span>🎥</span>
                <span>Watch Demo on YouTube</span>
              </a>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="text-center">
            <div 
              onClick={handleStartChatting}
              className="w-full h-40 py-6 px-6 bg-primary-blue text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105 cursor-pointer flex flex-col justify-center"
            >
              <h3 className="text-xl font-bold mb-2">
                {texts.startButtonTitle}
              </h3>
              <p className="text-sm leading-relaxed opacity-90">
                {texts.startButton}
              </p>
            </div>
          </div>
          
          <div className="text-center">
            <div 
              onClick={handleSetupFirst}
              className="w-full h-40 py-6 px-6 bg-primary-blue text-white rounded-xl shadow-lg hover:shadow-xl hover:bg-blue-700 transition-all duration-200 transform hover:scale-105 cursor-pointer flex flex-col justify-center"
            >
              <h3 className="text-xl font-bold mb-2">
                {texts.setupButtonTitle}
              </h3>
              <p className="text-sm leading-relaxed opacity-90">
                {texts.setupButton}
              </p>
            </div>
          </div>
        </div>

        {/* Note */}
        <p className="mt-6 text-sm text-gray-500 dark:text-gray-400">
          {texts.note}
        </p>
      </div>

      {/* Settings Guidance Modal */}
      <Dialog
        open={showSettingsGuidance}
        onClose={() => setShowSettingsGuidance(false)}
        title={texts.settingsGuidanceTitle}
      >
        <div className="px-6 py-4">
          <div 
            className="text-lg text-gray-900 dark:text-white mb-4 leading-relaxed [&_strong]:font-bold [&_strong]:text-primary-text"
            dangerouslySetInnerHTML={{ __html: texts.settingsGuidanceText }}
          />
          
          <div className="mb-6">
            <img 
              src={settingScreenshot} 
              alt="Settings Button Location" 
              className="w-full max-w-xl mx-auto rounded-lg shadow-lg border border-gray-200 dark:border-gray-600"
            />
          </div>
          
          <div className="flex justify-center">
            <Button
              text={texts.settingsGuidanceButton}
              onClick={handleConfirmStartChatting}
              color="primary"
              className="px-8 py-3 text-base font-semibold"
            />
          </div>
        </div>
      </Dialog>
    </div>
  )
}

export default WelcomePage