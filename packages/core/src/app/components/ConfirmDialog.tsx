import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import Dialog from './Dialog'
import Button from './Button'

interface Props {
  open: boolean
  title?: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
}

/**
 * window.confirm() 相当。VSCode webview では window.confirm が常に false を
 * 返すため使えず、代わりにこの React ダイアログで確認を取る。
 */
const ConfirmDialog: FC<Props> = (props) => {
  const { t } = useTranslation()
  return (
    <Dialog title={props.title} open={props.open} onClose={props.onCancel} className="w-[90vw] max-w-[420px]">
      <div className="px-5 py-4 flex flex-col gap-4">
        <p className="text-sm text-primary-text whitespace-pre-wrap">{props.message}</p>
        <div className="flex flex-row justify-end gap-2">
          <Button text={props.cancelText ?? t('Cancel')} color="flat" onClick={props.onCancel} />
          <Button text={props.confirmText ?? t('OK')} color="primary" onClick={props.onConfirm} />
        </div>
      </div>
    </Dialog>
  )
}

export default ConfirmDialog
