import { FC, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomApiProvider, CustomApiConfig } from '~services/user-config';
import { ProviderConfig } from '~services/user-config/types/provider';
import { ApiModel } from '~utils/model-fetcher';
import Button from '../Button';
import { Input, Textarea } from '../Input';
import Select from '../Select';
import { BiRefresh } from 'react-icons/bi';
import ReplicateSettings from './ReplicateSettings';

/** Fixed model lists per provider (single source of truth) */
const PROVIDER_MODEL_LISTS: Record<string, { name: string; value: string }[]> = {
  novita: [
    { name: 'Qwen Image', value: 'qwen-image' },
    { name: 'GLM Image', value: 'glm-image' },
    { name: 'Hunyuan Image 3', value: 'hunyuan-image-3' },
    { name: 'Seedream 4.0', value: 'seedream-4-0' },
    { name: 'Seedream 5.0 lite', value: 'seedream-5-0-lite' },
  ],
};

/** Detect provider key for model list lookup */
function getProviderModelListKey(provider: ProviderConfig): string | null {
  if (provider.provider === CustomApiProvider.NovitaAI || /novita/i.test(provider.host || '')) return 'novita';
  return null;
}

interface Props {
  config: CustomApiConfig;
  index: number;
  userConfig: {
    providerConfigs?: ProviderConfig[];
    customApiConfigs?: CustomApiConfig[];
  };
  onUpdateConfig: (index: number, updates: Partial<CustomApiConfig>) => void;
  onFetchSchema: (index: number) => Promise<void>;
  schemaLoading: Record<number, boolean>;
  modelsPerConfig: Record<number, ApiModel[]>;
  onFetchSingleModel: (index: number) => Promise<void>;
  modelsLoading: boolean;
  formRowClass: string;
  labelClass: string;
  isProviderSupported: (provider: CustomApiProvider) => boolean;
}

export const ImageAgentSettings: FC<Props> = ({
  config,
  index,
  userConfig,
  onUpdateConfig,
  onFetchSchema,
  schemaLoading,
  modelsPerConfig,
  onFetchSingleModel,
  modelsLoading,
  formRowClass,
  labelClass,
  isProviderSupported
}) => {
  const { t } = useTranslation();

  const handleUpdateAgenticSetting = (key: string, value: any) => {
    onUpdateConfig(index, {
      agenticImageBotSettings: {
        ...(config.agenticImageBotSettings || {}),
        [key]: value
      }
    });
  };

  // Auto-set default model when provider changes
  useEffect(() => {
    const imageProvider = (userConfig.providerConfigs || []).find(
      p => p.id === config.agenticImageBotSettings?.imageGeneratorProviderId
    );
    if (!imageProvider || config.model) return;

    const key = getProviderModelListKey(imageProvider);
    if (key) {
      onUpdateConfig(index, { model: PROVIDER_MODEL_LISTS[key][0].value });
    }
  }, [config.agenticImageBotSettings?.imageGeneratorProviderId, index, onUpdateConfig]);

  const renderModelSelection = () => {
    const imageProvider = (userConfig.providerConfigs || []).find(
      p => p.id === config.agenticImageBotSettings?.imageGeneratorProviderId
    );
    if (!imageProvider) return null;

    const isReplicate = imageProvider.provider === CustomApiProvider.Replicate || /replicate/i.test(imageProvider.host || '');
    const modelListKey = getProviderModelListKey(imageProvider);

    if (modelListKey) {
      const models = PROVIDER_MODEL_LISTS[modelListKey];
      return (
        <div className={formRowClass}>
          <p className={labelClass}>{t('Image Model')}</p>
          <Select
            options={models}
            value={config.model || models[0].value}
            onChange={(v) => onUpdateConfig(index, { model: v })}
          />
          <span className="text-xs opacity-70">{t('Select Novita model. Tool definition will be set automatically.')}</span>
        </div>
      );
    } else if (isReplicate) {
      // Replicate: Use ReplicateSettings component
      return (
        <ReplicateSettings
          config={config}
          index={index}
          onUpdateConfig={onUpdateConfig}
          onFetchSchema={onFetchSchema}
          schemaLoading={schemaLoading}
          formRowClass={formRowClass}
          labelClass={labelClass}
        />
      );
    } else {
      // Other providers: Free input with suggestions
      return (
        <div className={formRowClass}>
          <p className={labelClass}>{t('Image Model')}</p>
          <Input
            value={config.model || ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => onUpdateConfig(index, { model: e.target.value })}
            placeholder="chroma, FLUX.1-dev, etc."
          />
          <span className="text-xs opacity-70">
            {t('Common models: chroma, FLUX.1-dev, FLUX.1-schnell. Tool definition will be auto-detected.')}
          </span>
        </div>
      );
    }
  };

  return (
    <>
      {/* Image Generator Provider Selection */}
      <div className={formRowClass}>
        <p className={labelClass}>{t('Image Generator Provider')}</p>
        <Select
          options={(userConfig.providerConfigs || [])
            .filter(p => p.outputType === 'image')
            .map(p => ({ name: p.name, value: p.id }))}
          value={config.agenticImageBotSettings?.imageGeneratorProviderId || ''}
          onChange={(v) => handleUpdateAgenticSetting('imageGeneratorProviderId', v || undefined)}
          showIcon={true}
        />
        <div className="space-y-1">
          <span className="text-xs opacity-70">{t('Select which image generation API to use')}</span>
          {(() => {
            const selectedProvider = (userConfig.providerConfigs || []).find(
              (p: any) => p.id === config.agenticImageBotSettings?.imageGeneratorProviderId
            )
            if (selectedProvider?.provider === CustomApiProvider.Replicate) {
              return (
                <div className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                  </svg>
                  <span>{t('Easy setup with API integration - supports a wide range of models')}</span>
                </div>
              )
            }
            return null
          })()}
        </div>
      </div>

      {/* Prompt Generator Bot Selection */}
      <div className={formRowClass}>
        <p className={labelClass}>{t('Prompt Generator Bot')}</p>
        <Select
          options={[
            { name: t('None (Use raw prompt)'), value: '-1' },
            ...(userConfig.customApiConfigs || [])
              .map((c: any, i: number) => ({ name: `#${i + 1} ${c.name}`, value: String(i) }))
              .filter((_: any, optIndex: number) => optIndex !== index)
          ]}
          value={
            config.agenticImageBotSettings?.promptGeneratorBotIndex === null ||
            config.agenticImageBotSettings?.promptGeneratorBotIndex === undefined
              ? '-1'
              : String(config.agenticImageBotSettings.promptGeneratorBotIndex)
          }
          onChange={(v) => handleUpdateAgenticSetting('promptGeneratorBotIndex', v === '-1' ? null : parseInt(v))}
        />
        <span className="text-xs opacity-70">{t('Chatbot to enhance/generate image prompts')}</span>
      </div>

      {/* Model Selection */}
      {renderModelSelection()}
    </>
  );
};

export default ImageAgentSettings;