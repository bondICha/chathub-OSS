import { useEffect } from 'react'
import { useUserConfig } from './use-user-config'
import { FontType } from '~/services/user-config'

/**
 * フォント設定を適用するカスタムフック
 * ユーザーの設定に応じてルート要素に data-font-type 属性を設定
 */
export function useFontType() {
  const userConfig = useUserConfig()
  
  useEffect(() => {
    if (userConfig?.fontType) {
      // ルート要素に data-font-type 属性を設定
      document.documentElement.setAttribute('data-font-type', userConfig.fontType)
    } else {
      // デフォルト値を設定
      document.documentElement.setAttribute('data-font-type', FontType.SERIF)
    }
  }, [userConfig?.fontType])
}