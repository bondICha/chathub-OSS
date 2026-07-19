import { Dialog as HeadlessDialog, Transition } from '@headlessui/react'
import { FC, Fragment, PropsWithChildren, useState } from 'react'
import closeIcon from '~/assets/icons/close.svg'
import { cx } from '~/utils'
import { BiCollapse, BiExpand } from 'react-icons/bi'
import { FiMaximize2, FiMinimize2 } from 'react-icons/fi'

interface Props {
  title?: string
  open: boolean
  onClose: () => void
  className?: string
  borderless?: boolean
  titleBarAddon?: React.ReactNode
  footer?: React.ReactNode
  // 幅プリセット
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl'
}

const ExpandableDialog: FC<PropsWithChildren<Props>> = (props) => {
  const [isMaximized, setIsMaximized] = useState(false)
  const [isWide, setIsWide] = useState(false)

  // 幅プリセットに対応する max-width クラス
  const sizeMaxWidthMap: Record<NonNullable<Props['size']>, string> = {
    sm: 'max-w-[480px]',
    md: 'max-w-[600px]',
    lg: 'max-w-[800px]',
    xl: 'max-w-[1024px]',
    '2xl': 'max-w-[1280px]',
    '3xl': 'max-w-[1600px]',
  }
  const baseSize = props.size ?? 'md'
  
  const getDialogClassName = () => {
    if (isMaximized) {
      // 最大化は画面全体を使用
      return 'w-screen h-screen max-w-full max-h-full rounded-none flex flex-col'
    }
    if (isWide) {
      // 横幅拡大は w-full + max-w を 93vw に、かつ上限 1024px に
      return 'w-full h-[95vh] max-w-[min(93vw,1024px)] flex flex-col'
    }
    // 通常状態でも height を数値指定にしてアニメーションを滑らかにする
    const hasExplicitHeight = props.className?.match(/\bh-(?:\[.*?\]|screen|full|\d)/)
    const baseMaxWidth = sizeMaxWidthMap[baseSize]
    // 幅は常に w-full、実幅は max-width で制御する
    return cx('flex flex-col w-full', baseMaxWidth, !hasExplicitHeight && 'h-[70vh]', props.className)
  }

  return (
    <Transition.Root show={props.open} as={Fragment}>
      <HeadlessDialog as="div" onClose={props.onClose} className="relative z-50">
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 bg-opacity-75 transition-opacity" />
        </Transition.Child>
        <div className="fixed inset-0 flex items-center justify-center m-5 overflow-y-auto">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
            enterTo="opacity-100 translate-y-0 sm:scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 translate-y-0 sm:scale-100"
            leaveTo="opacity-0 translate-y-4 sm:translate-y-0 sm:scale-95"
          >
            <HeadlessDialog.Panel
              className={cx(
                'mx-auto rounded-2xl bg-primary-background shadow-2xl overflow-hidden transition-[max-width,height] duration-300 ease-in-out',
                getDialogClassName(),
              )}
              style={{ willChange: 'width, height', scrollbarGutter: 'stable both-edges' }}
            >
              {props.title ? (
                <HeadlessDialog.Title
                  className={cx(
                    !props.borderless && 'border-b',
                    'border-solid border-primary-border flex flex-row justify-between items-center py-3 px-5',
                  )}
                >
                  <div className="w-8">{/* spacer */}</div>
                  <span className="font-bold text-primary-text text-base">{props.title}</span>
                  <div className="flex items-center gap-2">
                    {props.titleBarAddon}
                    <button
                      className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                      onClick={() => setIsWide(!isWide)}
                      title={isWide ? 'Shrink Horizontally' : 'Expand Horizontally'}
                    >
                      {isWide ? <FiMinimize2 /> : <FiMaximize2 />}
                    </button>
                    <button
                      className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
                      onClick={() => setIsMaximized(!isMaximized)}
                      title={isMaximized ? 'Restore' : 'Maximize'}
                    >
                      {isMaximized ? <BiCollapse /> : <BiExpand />}
                    </button>
                    <img src={closeIcon} className="w-4 h-4 cursor-pointer" onClick={props.onClose} />
                  </div>
                </HeadlessDialog.Title>
              ) : (
                <HeadlessDialog.Title></HeadlessDialog.Title>
              )}
              <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">{props.children}</div>
              {props.footer && (
                <div className="flex-shrink-0 border-t border-primary-border p-4">{props.footer}</div>
              )}
            </HeadlessDialog.Panel>
          </Transition.Child>
        </div>
      </HeadlessDialog>
    </Transition.Root>
  )
}

export default ExpandableDialog