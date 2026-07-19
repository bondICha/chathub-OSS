import { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomApiConfig } from '~services/user-config';
import Button from '../Button';
import { Input, Textarea } from '../Input';
import toast from 'react-hot-toast';
import SystemPromptEditorModal from './SystemPromptEditorModal';

interface Props {
  config: CustomApiConfig;
  index: number;
  onUpdateConfig: (index: number, updates: Partial<CustomApiConfig>) => void;
  onFetchSchema: (index: number) => Promise<void>;
  schemaLoading: Record<number, boolean>;
  formRowClass: string;
  labelClass: string;
}

export const ReplicateSettings: FC<Props> = ({
  config,
  index,
  onUpdateConfig,
  onFetchSchema,
  schemaLoading,
  formRowClass,
  labelClass
}) => {
  const { t } = useTranslation();
  const [isSchemaModalOpen, setIsSchemaModalOpen] = useState(false);

  
  return (
    <>
      {/* Image Model */}
      <div className={formRowClass}>
        <p className={labelClass}>{t('Image Model')}</p>
        <div className="flex gap-2">
          <Input
            value={config.model || ''}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              const modelId = e.target.value;
              const u = { model: modelId } as any;

              if (modelId) {
                // Fallback: update description if no schema found
                const currentToolDef = config.toolDefinition;
                u.toolDefinition = {
                  name: 'generate_image',
                  description: `Generate images using ${modelId} model via Replicate.`,
                  input_schema: currentToolDef?.input_schema || {
                    type: 'object',
                    properties: {
                      prompt: {
                        type: 'string',
                        description: 'Text description of the image to generate. Be specific and descriptive.',
                      },
                    },
                    required: ['prompt'],
                  },
                };
              }

              onUpdateConfig(index, u);
            }}
            placeholder="black-forest-labs/flux-schnell, etc."
            className="flex-1"
          />
          <button
            onClick={() => onFetchSchema(index)}
            disabled={schemaLoading[index] || !config.model}
            className="px-3 py-1 text-xs rounded transition-colors bg-white dark:bg-black border border-gray-300 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-900 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
            title={t('Fetch input schema for this model from Replicate API')}
          >
            {schemaLoading[index] ? t('Loading...') : t('Fetch Schema')}
          </button>
        </div>
        <span className="text-xs opacity-70">
          {t('Common models: black-forest-labs/flux-schnell, black-forest-labs/flux-1.1-pro, stability-ai/sdxl. Tool definition will be auto-detected.')}
        </span>
      </div>

      {/* Tool Description */}
      <div className={formRowClass}>
        <p className={labelClass}>{t('Tool Description')}</p>
        <Textarea
          value={config.toolDefinition?.description || ''}
          onChange={(e) => onUpdateConfig(index, {
            toolDefinition: {
              ...config.toolDefinition,
              name: 'generate_image',
              description: e.currentTarget.value,
              input_schema: config.toolDefinition?.input_schema || {
                type: 'object',
                properties: {
                  prompt: {
                    type: 'string',
                    description: 'Text description of the image to generate. Be specific and descriptive.',
                  },
                },
                required: ['prompt'],
              }
            }
          })}
          placeholder={t('Enter tool description...')}
        />
        <span className="text-xs opacity-70">
          {t('Description for the AI model about how to use this tool')}
        </span>
      </div>

      {/* Input Schema */}
      <div className={formRowClass}>
        <div className="flex items-center justify-between">
          <p className={labelClass}>{t('Input Schema (JSON)')}</p>
          <div className="flex gap-2">
            <Button
              size="small"
              text={schemaLoading[index] ? t('Loading...') : t('Fetch Schema')}
              onClick={() => onFetchSchema(index)}
              disabled={schemaLoading[index] || !config.model}
              color="primary"
            />
            <Button
              size="small"
              text={t('Edit')}
              onClick={() => setIsSchemaModalOpen(true)}
              color="flat"
            />
          </div>
        </div>

        <Textarea
          value={JSON.stringify(config.toolDefinition?.input_schema || {}, null, 2)}
          placeholder={t('Enter JSON schema...')}
          readOnly
          className="font-mono text-xs"
          rows={8}
        />
        <span className="text-xs opacity-70">
          {t('JSON schema defining the input parameters for the tool')}
        </span>
      </div>

      {/* Input Schema Editor Modal */}
      <SystemPromptEditorModal
        open={isSchemaModalOpen}
        onClose={() => setIsSchemaModalOpen(false)}
        value={JSON.stringify(config.toolDefinition?.input_schema || {}, null, 2)}
        onSave={(value) => {
          try {
            const schema = JSON.parse(value);
            onUpdateConfig(index, {
              toolDefinition: {
                ...config.toolDefinition,
                name: 'generate_image',
                description: config.toolDefinition?.description || '',
                input_schema: schema
              }
            });
          } catch (err) {
            toast.error(t('Invalid JSON format'));
            console.error('JSON parse error:', err);
          }
        }}
        title={t('Edit Input Schema')}
        placeholder={t('Enter JSON schema...')}
        isJsonMode={true}
      />
    </>
  );
};

export default ReplicateSettings;