import { FC, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Browser from 'webextension-polyfill'
import { MIGRATION_STATUS_KEY, MigrationState } from '~services/chat-history'
import { StorageMigrationService } from '~services/storage-migration'

interface MigrationProgressProps {
  showOnHistoryPage?: boolean
  onMigrationComplete?: () => void
}

export const MigrationProgress: FC<MigrationProgressProps> = ({
  showOnHistoryPage = false,
  onMigrationComplete
}) => {
  const { t } = useTranslation()
  const [status, setStatus] = useState<MigrationState | null>(null)
  const [showConfirmation, setShowConfirmation] = useState(false)

  useEffect(() => {
    const checkStatus = async () => {
      const result = await Browser.storage.local.get(MIGRATION_STATUS_KEY)
      const migrationStatus = result[MIGRATION_STATUS_KEY]
      setStatus(migrationStatus)

      // Show confirmation dialog if on history page and migration is needed
      if (showOnHistoryPage && (!migrationStatus || migrationStatus.status === 'idle')) {
        setShowConfirmation(true)
      }
    }

    checkStatus()

    // Listen for updates
    const listener = (changes: any) => {
      if (changes[MIGRATION_STATUS_KEY]) {
        const newStatus = changes[MIGRATION_STATUS_KEY].newValue
        setStatus(newStatus)

        // Call completion callback when migration completes
        if (newStatus?.status === 'completed' && onMigrationComplete) {
          onMigrationComplete()
        }
      }
    }

    Browser.storage.onChanged.addListener(listener)
    return () => Browser.storage.onChanged.removeListener(listener)
  }, [showOnHistoryPage, onMigrationComplete])

  const handleStartMigration = async () => {
    setShowConfirmation(false)
    try {
      const migrator = new StorageMigrationService()
      await migrator.startMigration()
    } catch (error) {
      console.error('Migration failed:', error)
    }
  }

  const handleCancelMigration = () => {
    setShowConfirmation(false)
  }

  const handleRetry = async () => {
    try {
      const migrator = new StorageMigrationService()
      await migrator.startMigration()
    } catch (error) {
      console.error('Migration retry failed:', error)
    }
  }

  // Confirmation dialog
  if (showConfirmation) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-primary-background p-6 rounded-xl shadow-xl max-w-md w-full mx-4">
          <h3 className="text-lg font-semibold mb-4 text-primary-text">
            {t('Storage Optimization Available')}
          </h3>
          <p className="text-sm text-primary-text opacity-80 mb-4">
            {t('We can optimize your chat history storage to improve loading speed by up to 16×. This one-time process will migrate your existing sessions to a more efficient format.')}
          </p>
          <p className="text-xs text-primary-text opacity-60 mb-6">
            {t('This may take a few minutes depending on the number of sessions you have.')}
          </p>
          <div className="flex flex-row gap-3">
            <button
              onClick={handleCancelMigration}
              className="flex-1 px-4 py-2 bg-secondary text-primary-text rounded-lg hover:bg-secondary/80 transition-colors"
            >
              {t('Later')}
            </button>
            <button
              onClick={handleStartMigration}
              className="flex-1 px-4 py-2 bg-primary-blue text-white rounded-lg hover:opacity-90 transition-all"
            >
              {t('Optimize Now')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Don't show anything if migration is completed or not started
  if (!status || status.status === 'completed' || status.status === 'idle') return null

  if (status.status === 'running' || status.status === 'verifying') {
    const progress = status.totalCount > 0
      ? (status.migratedCount / status.totalCount) * 100
      : 0

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-primary-background p-6 rounded-xl shadow-xl max-w-md w-full mx-4">
          <h3 className="text-lg font-semibold mb-4 text-primary-text">
            {status.status === 'verifying'
              ? t('Verifying migration...')
              : t('Optimizing Storage...')}
          </h3>
          <div className="w-full bg-secondary rounded-full h-2 mb-4">
            <div
              className="bg-primary-blue h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-primary-text opacity-80">
            {t('Migrating {{current}} of {{total}} sessions', {
              current: status.migratedCount,
              total: status.totalCount
            })}
          </p>
          <p className="text-xs text-primary-text opacity-60 mt-2">
            {t('Please wait, this will only happen once...')}
          </p>
        </div>
      </div>
    )
  }

  if (status.status === 'error') {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-primary-background p-6 rounded-xl shadow-xl max-w-md w-full mx-4">
          <h3 className="text-lg font-semibold mb-4 text-red-600">
            {t('Migration Error')}
          </h3>
          <p className="text-sm text-primary-text opacity-80 mb-4">
            {status.error?.message || t('An unknown error occurred')}
          </p>
          <button
            onClick={handleRetry}
            className="w-full px-4 py-2 bg-primary-blue text-white rounded-lg hover:opacity-90 transition-all"
          >
            {t('Retry')}
          </button>
        </div>
      </div>
    )
  }

  return null
}
