import { Dialog as HeadlessDialog, Transition } from '@headlessui/react'
import { FC, Fragment, PropsWithChildren } from 'react'
import closeIcon from '~/assets/icons/close.svg'
import { cx } from '~/utils'

interface Props {
  title?: string
  open: boolean
  onClose: () => void
  className?: string
  borderless?: boolean
  titleBarAddon?: React.ReactNode
}

const Dialog: FC<PropsWithChildren<Props>> = (props) => {
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
                'mx-auto rounded-2xl bg-primary-background shadow-2xl max-h-[85vh] overflow-auto flex flex-col transition-all duration-300 ease-in-out',
                props.className,
              )}
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
                    <img src={closeIcon} className="w-4 h-4 cursor-pointer" onClick={props.onClose} />
                  </div>
                </HeadlessDialog.Title>
              ) : (
                <HeadlessDialog.Title></HeadlessDialog.Title>
              )}
              {props.children}
            </HeadlessDialog.Panel>
          </Transition.Child>
        </div>
      </HeadlessDialog>
    </Transition.Root>
  )
}

export default Dialog
