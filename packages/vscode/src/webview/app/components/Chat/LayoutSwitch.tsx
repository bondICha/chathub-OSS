import { cx } from '~/utils'
import { FC } from 'react'
import { Layout } from '~app/consts'
import { useTranslation } from 'react-i18next'
import { MinusIcon, PlusIcon } from '@heroicons/react/24/outline'

interface Props {
  layout: Layout
  onChange: (layout: Layout) => void
}

const LayoutSwitch: FC<Props> = (props) => {
  const { t } = useTranslation()

  // 利用可能なレイアウトのリスト（1, 2, 3, 4, 6）- 2の向きは別途切り替え
  const layouts: Layout[] = ['single', 2, 3, 4, 'sixGrid']

  // 現在のレイアウトのインデックスを取得
  const getCurrentIndex = (): number => {
    // twoHorizonも2として扱う
    const normalizedLayout = (props.layout === 'twoVertical' || props.layout === 'twoHorizon') ? 2 : props.layout
    const index = layouts.findIndex(l => l === normalizedLayout)
    return index >= 0 ? index : 1 // デフォルトは2 (index 1)
  }

  // パネル数を取得
  const getPanelCount = (layout: Layout): number => {
    if (layout === 'single') return 1
    if (layout === 2 || layout === 'twoVertical' || layout === 'twoHorizon') return 2
    if (layout === 3) return 3
    if (layout === 4) return 4
    if (layout === 'sixGrid') return 6
    return 2
  }

  // 2パネルレイアウトの向きを切り替え
  const toggle2PanelOrientation = () => {
    if (props.layout === 2 || props.layout === 'twoVertical') {
      props.onChange('twoHorizon') // 縦→横
    } else if (props.layout === 'twoHorizon') {
      props.onChange(2) // 横→縦
    }
  }

  // 前のレイアウトに移動（2→1は向きを保持）
  const handlePrevious = () => {
    const currentIndex = getCurrentIndex()
    if (currentIndex > 0) {
      props.onChange(layouts[currentIndex - 1])
    }
  }

  // 次のレイアウトに移動（2→3は向きを保持）
  const handleNext = () => {
    const currentIndex = getCurrentIndex()
    if (currentIndex < layouts.length - 1) {
      props.onChange(layouts[currentIndex + 1])
    }
  }

  const currentIndex = getCurrentIndex()
  const panelCount = getPanelCount(props.layout)
  const is2Panel = panelCount === 2

  return (
    <div className="flex items-center gap-0.5 bg-primary-background rounded-2xl px-1 py-0.5">
      {/* マイナスボタン */}
      <button
        className={cx(
          "flex items-center justify-center w-9 h-9 rounded-lg transition-colors",
          currentIndex > 0
            ? "hover:bg-[#00000014] dark:hover:bg-[#ffffff26] cursor-pointer"
            : "opacity-30 cursor-not-allowed"
        )}
        onClick={handlePrevious}
        disabled={currentIndex === 0}
        title={t('layout_decrease')}
      >
        <MinusIcon className="w-5 h-5" />
      </button>

      {/* 現在のパネル数表示 */}
      <div className="flex items-center justify-center w-9 h-9 rounded-full bg-[#00000014] dark:bg-[#ffffff26] text-lg font-medium">
        {panelCount}
      </div>

      {/* プラスボタン */}
      <button
        className={cx(
          "flex items-center justify-center w-9 h-9 rounded-lg transition-colors",
          currentIndex < layouts.length - 1
            ? "hover:bg-[#00000014] dark:hover:bg-[#ffffff26] cursor-pointer"
            : "opacity-30 cursor-not-allowed"
        )}
        onClick={handleNext}
        disabled={currentIndex === layouts.length - 1}
        title={t('layout_increase')}
      >
        <PlusIcon className="w-5 h-5" />
      </button>

      {/* 2パネルの場合のみ向き切り替えボタンを表示 */}
      {is2Panel && (
        <button
          className="flex items-center justify-center px-2 h-9 rounded-lg bg-[#00000014] dark:bg-[#ffffff26] hover:opacity-80 transition-opacity text-sm font-medium cursor-pointer ml-0.5"
          onClick={toggle2PanelOrientation}
          title={props.layout === 'twoHorizon' ? t('layout_2_vertical') : t('layout_2_horizontal')}
        >
          {props.layout === 'twoHorizon' ? t('layout_2_horizontal') : t('layout_2_vertical')}
        </button>
      )}
    </div>
  )
}

export default LayoutSwitch
