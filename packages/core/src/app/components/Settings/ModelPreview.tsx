import { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomApiProvider } from '~services/user-config';
import { fetchProviderModels, ApiModel, ModelFetchConfig } from '~utils/model-fetcher';
import Button from '../Button';
import { BiRefresh } from 'react-icons/bi';

interface Props {
  provider: CustomApiProvider;
  apiKey: string;
  host: string;
  isHostFullPath?: boolean;
  onModelSelect?: (modelId: string) => void;
  className?: string;
}

const ModelPreview: FC<Props> = ({
  provider,
  apiKey,
  host,
  isHostFullPath,
  onModelSelect,
  className = ''
}) => {
  const { t } = useTranslation();
  const [models, setModels] = useState<ApiModel[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const canFetchModels = !!(apiKey && host);

  const handleFetchModels = async () => {
    if (!canFetchModels) return;

    setLoading(true);
    setError(null);

    try {
      const config: ModelFetchConfig = {
        provider,
        apiKey,
        host,
        isHostFullPath
      };
      
      const fetchedModels = await fetchProviderModels(config);
      setModels(fetchedModels);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(`Failed to fetch models: ${errorMessage}`);
      setModels([]);
    } finally {
      setLoading(false);
    }
  };

  const handleModelClick = (modelId: string) => {
    setSelectedModel(modelId);
    onModelSelect?.(modelId);
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-sm">{t('Available Models')}</h4>
        <Button
          size="small"
          text={loading ? t('Loading...') : t('Fetch Models')}
          icon={<BiRefresh className={loading ? 'animate-spin' : ''} />}
          onClick={handleFetchModels}
          disabled={!canFetchModels || loading}
          color={canFetchModels ? "primary" : "flat"}
        />
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {models.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {t('Available Models')} ({models.length})
          </div>
          <div 
            className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden"
            style={{ maxHeight: '320px', overflowY: 'auto' }}
          >
            <div className="divide-y divide-gray-200 dark:divide-gray-700">
              {models.map((model) => (
                <div
                  key={model.id}
                  className={`p-3 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer transition-colors ${
                    selectedModel === model.id ? 'bg-blue-50 dark:bg-blue-900/20 border-l-2 border-blue-500' : ''
                  }`}
                  onClick={() => handleModelClick(model.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {model.id}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Provider: {model.owned_by}
                      </p>
                    </div>
                    {selectedModel === model.id && (
                      <div className="flex-shrink-0 ml-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full" />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {!loading && !error && models.length === 0 && canFetchModels && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p className="text-sm">{t('Click "Fetch Models" to load available models')}</p>
        </div>
      )}

      {!canFetchModels && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          <p className="text-sm">{t('Please configure API Key and Host to fetch models')}</p>
        </div>
      )}
    </div>
  );
};

export default ModelPreview;