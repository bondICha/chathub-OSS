import { FC, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useAtom, useAtomValue } from 'jotai'
import Button from '../Button'
import Dialog from '../Dialog'
import { companyProfileModalAtom, detectedCompanyAtom } from '~app/state'
import { setCompanyProfileState, CompanyProfileStatus, getCompanyProfileState, compareVersions } from '~services/company-profile'

const CompanyProfileModal: FC = () => {
  const { t } = useTranslation()
  const [open, setOpen] = useAtom(companyProfileModalAtom)
  const detectedCompany = useAtomValue(detectedCompanyAtom)
  const [currentVersion, setCurrentVersion] = useState<string | null>(null)
  const [isVersionUpdate, setIsVersionUpdate] = useState(false)

  useEffect(() => {
    if (detectedCompany) {
      getCompanyProfileState(detectedCompany.companyName).then(state => {
        if (state) {
          setCurrentVersion(state.version)
          setIsVersionUpdate(compareVersions(detectedCompany.version, state.version) > 0)
        }
      })
    }
  }, [detectedCompany])

  if (!detectedCompany) return null

  const handleClose = async () => {
    setOpen(false)
    // 「もう一度確認」: 既存のversionを維持（初回のみ検知版で初期化）
    const prev = await getCompanyProfileState(detectedCompany.companyName)
    await setCompanyProfileState({
      companyName: detectedCompany.companyName,
      version: prev?.version ?? detectedCompany.version,
      status: CompanyProfileStatus.UNCONFIRMED,
      lastChecked: Date.now(),
      checkCount: prev?.checkCount ?? 0
    })
  }

  const handleConfirm = async () => {
    setOpen(false)
    // Use window.location instead of navigate to avoid router context issues
    const params = new URLSearchParams({
      autoImport: 'templateData',
      company: detectedCompany.companyName
    })
    window.location.href = `#/setting?${params.toString()}`
  }

  const handleReject = async () => {
    setOpen(false)
    // 拒否: 既存のversionを維持（初回のみ検知版で初期化）
    const prev = await getCompanyProfileState(detectedCompany.companyName)
    await setCompanyProfileState({
      companyName: detectedCompany.companyName,
      version: prev?.version ?? detectedCompany.version,
      status: CompanyProfileStatus.REJECTED,
      lastChecked: Date.now(),
      checkCount: prev?.checkCount ?? 0
    })
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={`${detectedCompany.companyName} ${t('company_profile_detected')}`}
      className="max-w-md"
    >
      <div className="mb-6 px-6 py-4">
        {detectedCompany.logoUrl && (
          <div className="mb-4 flex justify-center">
            <img src={detectedCompany.logoUrl} alt={`${detectedCompany.companyName} logo`} className="h-12" />
          </div>
        )}
        {isVersionUpdate && currentVersion ? (
          <>
            <p className="text-base text-primary-text mb-3">
              {detectedCompany.companyName}{t('company_profile_version_update')}
            </p>
            <p className="text-sm text-primary-text mb-4">
              v{currentVersion} → v{detectedCompany.version} {t('company_profile_version_info')}
            </p>
            <p className="text-sm text-primary-text mb-4">{t('apply_company_profile_description')}</p>
          </>
        ) : (
          <>
            <p className="text-base text-primary-text mb-3">{`${detectedCompany.companyName} ${t('apply_company_profile')}`}</p>
            <p className="text-sm text-primary-text mb-4">{t('apply_company_profile_description')}</p>
            <p className="text-xs text-secondary-text">バージョン: {detectedCompany.version}</p>
          </>
        )}
      </div>
      <div className="flex justify-between items-center gap-4 mt-4 px-6 pb-4">
        <button
          onClick={handleReject}
          className="text-xs text-secondary-text hover:text-primary-text underline"
        >
          {t('Reject')}
        </button>
        <div className="flex gap-2">
          <Button text={t('Ask me again')} onClick={handleClose} color="flat" />
          <Button text={t('OK')} onClick={handleConfirm} color="primary" />
        </div>
      </div>
    </Dialog>
  )
}

export default CompanyProfileModal