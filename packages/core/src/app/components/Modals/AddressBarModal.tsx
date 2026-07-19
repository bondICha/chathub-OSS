import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import Dialog from '../Dialog'

interface Props {
  open: boolean
  onClose: () => void
  onDontShowAgain: () => void
}

const AddressBarModal: FC<Props> = ({ open, onClose, onDontShowAgain }) => {
  const { t } = useTranslation()

  return (
    <Dialog
      title={t('Address Bar Search Feature')}
      open={open}
      onClose={onClose}
      className="w-[min(600px,90vw)]"
    >
      <div className="space-y-4 px-6 py-4">
        <div className="text-base text-primary-text">
          <div
            dangerouslySetInnerHTML={{
              __html: t('addressbar_search_feature_description') 
            }} 
          />
        </div>
        
        {/* YouTube Video demonstration */}
        <div className="mt-6 flex justify-center">
          <iframe 
            width="500" 
            height="281" 
            src="https://www.youtube.com/embed/XOD8MumYkiM?si=wcGGqSkJ8nvPwLX8" 
            title="HuddleLLM Address Bar Search Demo" 
            frameBorder="0" 
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
            referrerPolicy="strict-origin-when-cross-origin" 
            allowFullScreen
            className="rounded-lg shadow-md max-w-full"
            style={{ maxWidth: '500px' }}
          />
        </div>
        
        <div className="flex justify-between items-center gap-2 pt-4">
          <button
            onClick={onDontShowAgain}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm underline transition-colors"
          >
            {t("Don't show again")}
          </button>
          <button
            onClick={onClose}
            className="bg-primary-blue text-white px-4 py-2 rounded-lg hover:bg-opacity-80 transition-colors"
          >
            {t('Got it!')}
          </button>
        </div>
      </div>
    </Dialog>
  )
}

export default AddressBarModal