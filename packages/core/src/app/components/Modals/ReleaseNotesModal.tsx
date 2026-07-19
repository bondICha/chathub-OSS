import { useAtom } from 'jotai'
import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { releaseNotesAtom } from '~app/state'
import { markCurrentVersionAsRead } from '~services/release-notes'
import Button from '../Button'
import ExpandableDialog from '../ExpandableDialog'
import Markdown from '../Markdown'

const ReleaseNotesModal: FC = () => {
  const { t } = useTranslation()
  const [notes, setNotes] = useAtom(releaseNotesAtom)
  const navigate = useNavigate()

  const handleClose = () => {
    setNotes([])
  }

  const handleNeverShow = () => {
    markCurrentVersionAsRead() // この時点でのみバージョン情報を更新
    setNotes([])
  }

  const handleNotesClick = (e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest('a')
    if (!anchor) return
    const href = anchor.getAttribute('href')
    if (href?.startsWith('#/')) {
      e.preventDefault()
      handleNeverShow()
      navigate({ to: href.slice(1) })
    }
  }

  return (
    <ExpandableDialog
      title={t('Recent Updates')}
      open={notes.length > 0}
      onClose={handleClose}
      size="md"
    >
      {/* コンテンツ領域 */}
      <div className="flex flex-col gap-4 px-5 py-5 flex-1 min-h-0 overflow-y-auto custom-scrollbar" onClick={handleNotesClick}>
        {notes.map((versionData, versionIndex) => {
          return (
            <div key={versionIndex} className="bg-secondary bg-opacity-20 border border-primary-border rounded-xl p-4">
              {/* バージョンヘッダー */}
              <div className="flex items-center gap-2 mb-3">
                <div className="text-sm font-semibold px-3 py-1 rounded-lg text-white" style={{backgroundColor: 'rgb(var(--color-primary-blue))'}}>
                  v{versionData.version}
                </div>
              </div>
              
              {/* リリースノートリスト */}
              <div className="flex flex-col gap-2">
                {versionData.notes.map((note, noteIndex) => {
                  return (
                    <div key={noteIndex} className="flex flex-row gap-3 items-start">
                      <div className="flex-none rounded-full p-1 text-green-400 bg-green-400/10 mt-1">
                        <div className="h-2 w-2 rounded-full bg-current" />
                      </div>
                      <div className="text-primary-text text-sm leading-relaxed">
                        <Markdown allowHtml={true}>{t(note)}</Markdown>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      {/* ボタン領域の追加 */}
      <div className="border-t border-solid border-primary-border px-5 py-3 flex justify-between">
        <button
          onClick={handleNeverShow}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          {t('ReleaseNote-HideUntilNextVersion')}
        </button>
        <div className="flex flex-row items-center gap-2">
          <button
            className="text-sm bg-secondary rounded-full px-6 py-[5px] flex flex-col items-center text-primary-text"
            onClick={handleClose}
          >
            <span className="font-medium">{t('ReleaseNote-Close')}</span>
            <span className="text-xs text-gray-500">{t('ReleaseNote-ShowAgain')}</span>
          </button>
        </div>
      </div>
    </ExpandableDialog>
  )
}

export default ReleaseNotesModal
