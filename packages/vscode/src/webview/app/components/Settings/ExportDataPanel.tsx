import { useTranslation } from 'react-i18next'
import { BiExport, BiImport } from 'react-icons/bi'
import { exportData, exportCustomAPITemplate, importData } from '~app/utils/export'
import Button from '../Button'
import React, { useEffect, useState } from 'react';
import CustomAPITemplateImportPanel from './CustomAPITemplateImportPanel';
import { UserConfig } from '~services/user-config';
import { useLocation } from '@tanstack/react-router'

interface Props {
  userConfig: UserConfig
  updateConfigValue: (update: Partial<UserConfig>) => void
}

function ExportDataPanel({ userConfig, updateConfigValue }: Props) {
  const { t } = useTranslation()
  const location = useLocation()
  const [autoImportTemplate, setAutoImportTemplate] = useState<string | undefined>(undefined)
  const [companyName, setCompanyName] = useState<string | undefined>(undefined)

  useEffect(() => {
    // URLが変わっても（SettingPage上に居続けても）自動インポートを検知できるようにする
    const hash = window.location.hash
    const queryStart = hash.indexOf('?')
    if (queryStart === -1) return

    const urlParams = new URLSearchParams(hash.substring(queryStart + 1))
    const autoImport = urlParams.get('autoImport')
    const company = urlParams.get('company')
    if (!autoImport || !company) return

    setAutoImportTemplate(autoImport)
    setCompanyName(company)

    // URLパラメータをクリア（SettingPage滞在中に同じクエリを保持しない）
    const newHash = hash.substring(0, queryStart)
    window.history.replaceState({}, '', window.location.pathname + newHash)
  }, [location.hash, location.search])
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <BiExport className="text-lg opacity-70" />
        <h2 className="text-lg font-semibold">{t('Import Export Panel')}</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* All Import Export */}
        <div className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white/40 dark:bg-black/30 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/40">
              {t('All Data')}
            </span>
            <h3 className="font-semibold text-sm">{t('All Import Export　（Including API Key）')}</h3>
          </div>
          <p className="text-xs opacity-70 mb-3">
            {t('Data includes all your settings, api key, chat histories, and local prompts. Do not share API Key with someone elses.')}
          </p>
          <div className="flex gap-2">
            <Button
              size="normal"
              text={t('Import')}
              icon={<BiImport />}
              onClick={importData}
              color="flat"
              className="flex-1 justify-center"
            />
            <Button
              size="normal"
              text={t('Export')}
              icon={<BiExport />}
              onClick={exportData}
              color="primary"
              className="flex-1 justify-center"
            />
          </div>
        </div>

        {/* Template Import Export */}
        <div className="rounded-lg border border-gray-300 dark:border-gray-700 bg-white/40 dark:bg-black/30 p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 border border-indigo-500/40">
              {t('Template')}
            </span>
            <h3 className="font-semibold text-sm">{t('Template Import Export')}</h3>
          </div>
          <p className="text-xs opacity-70 mb-3">
            {t('Import or export Custom API settings without affecting other data')}
          </p>
          <div className="flex gap-2">
            <CustomAPITemplateImportPanel
              userConfig={userConfig}
              updateConfigValue={updateConfigValue}
              autoImportTemplate={autoImportTemplate}
              companyName={companyName}
            />
            <Button
              size="normal"
              text={t('Export Template')}
              icon={<BiExport />}
              onClick={exportCustomAPITemplate}
              color="primary"
              className="flex-1 justify-center"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

export default ExportDataPanel
