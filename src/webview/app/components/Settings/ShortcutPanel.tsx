import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Browser from 'webextension-polyfill'
import Button from '~app/components/Button'
import KDB from '~app/components/Settings/KDB'
import { rpc } from '~platform/rpc-client'

function ShortcutPanel() {
  const [shortcuts, setShortcuts] = useState<string[]>([])
  const { t } = useTranslation()

  useEffect(() => {
    Browser.commands.getAll().then((commands) => {
      for (const c of commands) {
        if (c.name === 'open-app' && c.shortcut) {
          setShortcuts(c.shortcut ? [c.shortcut] : [])
        }
      }
    })
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <p className="font-bold text-lg">{t('Shortcut to open this app')}</p>
      <div className="flex flex-row gap-2 items-center">
        {shortcuts.length > 0 && (
          <div className="flex flex-row gap-1">
            {shortcuts.map((s) => (
              <KDB key={s} text={s} />
            ))}
          </div>
        )}
        <Button
          text={t('Change shortcut')}
          size="small"
          onClick={() => rpc.post({ type: 'ui.openKeybindings' })}
        />
      </div>
    </div>
  )
}

export default ShortcutPanel
