import { FC, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CustomApiConfig, ToolDefinition } from '~services/user-config';
import Button from '../Button';
import { Textarea } from '../Input';
import toast from 'react-hot-toast';

interface Props {
  config: CustomApiConfig;
  index: number;
  onUpdateConfig: (index: number, updates: Partial<CustomApiConfig>) => void;
  formRowClass: string;
  labelClass: string;
  showAdvanced?: boolean;
}

export const ToolDefinitionEditor: FC<Props> = ({
  config,
  index,
  onUpdateConfig,
  formRowClass,
  labelClass,
  showAdvanced = false
}) => {
  const { t } = useTranslation();
  const [editingToolDefinition, setEditingToolDefinition] = useState<{ index: number; text: string } | null>(null);

  const createDefaultToolDefinition = (): ToolDefinition => ({
    name: 'generate_image',
    description: 'Generate images based on the provided prompt.',
    input_schema: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Text description of the image to generate.',
        },
      },
      required: ['prompt'],
    }
  });

  const ensureToolDefinitionExists = () => {
    if (!config.toolDefinition) {
      onUpdateConfig(index, {
        toolDefinition: createDefaultToolDefinition()
      });
    }
  };

  const handleSchemaChange = (value: string) => {
    try {
      const schema = JSON.parse(value);
      onUpdateConfig(index, {
        toolDefinition: {
          ...config.toolDefinition,
          name: config.toolDefinition?.name || 'generate_image',
          description: config.toolDefinition?.description || '',
          input_schema: schema
        }
      });
    } catch (err) {
      // Invalid JSON, don't update but allow user to continue editing
    }
  };

  if (!showAdvanced) {
    return null;
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
      <div className="mb-4">
        <h4 className="font-medium text-sm text-gray-700 dark:text-gray-300 mb-2">
          {t('Tool Definition (Advanced)')}
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('Advanced tool configuration for API integration')}
        </p>
      </div>

      {/* Tool Definition Toggle */}
      <div className={formRowClass}>
        <p className={labelClass}>{t('Enable Tool Definition')}</p>
        <Button
          text={config.toolDefinition ? t('Enabled') : t('Disabled')}
          onClick={() => {
            if (config.toolDefinition) {
              onUpdateConfig(index, { toolDefinition: undefined });
            } else {
              ensureToolDefinitionExists();
            }
          }}
          color={config.toolDefinition ? 'primary' : 'flat'}
          size="small"
        />
        <span className="text-xs opacity-70">
          {t('Enable custom tool definition for this provider')}
        </span>
      </div>

      {config.toolDefinition && (
        <>
          {/* Tool Name */}
          <div className={formRowClass}>
            <p className={labelClass}>{t('Tool Name')}</p>
            <Textarea
              value={config.toolDefinition.name || ''}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onUpdateConfig(index, {
                toolDefinition: {
                  ...(config.toolDefinition || { name: 'generate_image', description: '', input_schema: { type: 'object', properties: {}, required: [] } }),
                  name: e.target.value || 'generate_image',
                  description: config.toolDefinition?.description || '',
                  input_schema: config.toolDefinition?.input_schema || { type: 'object', properties: {}, required: [] }
                }
              })}
              placeholder="generate_image"
              className="font-mono text-sm"
              rows={1}
            />
            <span className="text-xs opacity-70">
              {t('Function name for the tool (usually generate_image)')}
            </span>
          </div>

          {/* Tool Description */}
          <div className={formRowClass}>
            <p className={labelClass}>{t('Tool Description')}</p>
            <Textarea
              value={config.toolDefinition?.description || ''}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => onUpdateConfig(index, {
                toolDefinition: {
                  ...(config.toolDefinition || { name: 'generate_image', description: '', input_schema: { type: 'object', properties: {}, required: [] } }),
                  name: config.toolDefinition?.name || 'generate_image',
                  description: e.target.value
                }
              })}
              placeholder={t('Describe what this tool does...')}
            />
            <span className="text-xs opacity-70">
              {t('Description for the AI about how to use this tool')}
            </span>
          </div>

          {/* Input Schema */}
          <div className={formRowClass}>
            <div className="flex items-center justify-between">
              <p className={labelClass}>{t('Input Schema (JSON)')}</p>
              <Button
                size="small"
                text={editingToolDefinition?.index === index ? t('Close Editor') : t('Open Editor')}
                onClick={() => setEditingToolDefinition(
                  editingToolDefinition?.index === index
                    ? null
                    : {
                        index,
                        text: JSON.stringify(config.toolDefinition?.input_schema || {}, null, 2)
                      }
                )}
                color="flat"
              />
            </div>

            {editingToolDefinition?.index === index ? (
              <div className="space-y-2">
                <textarea
                  className="w-full h-64 p-3 font-mono text-xs bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md"
                  value={editingToolDefinition.text}
                  onChange={(e) => setEditingToolDefinition({ ...editingToolDefinition, text: e.target.value })}
                  placeholder={t('Enter JSON schema...')}
                />
                <div className="flex gap-2">
                  <Button
                    size="small"
                    text={t('Save')}
                    onClick={() => {
                      try {
                        handleSchemaChange(editingToolDefinition.text);
                        setEditingToolDefinition(null);
                      } catch (err) {
                        toast.error(t('Invalid JSON format'));
                        console.error('JSON parse error:', err);
                      }
                    }}
                    color="primary"
                  />
                  <Button
                    size="small"
                    text={t('Cancel')}
                    onClick={() => setEditingToolDefinition(null)}
                    color="flat"
                  />
                </div>
              </div>
            ) : (
              <Textarea
                value={JSON.stringify(config.toolDefinition?.input_schema || {}, null, 2)}
                onChange={(e) => handleSchemaChange(e.target.value)}
                placeholder={t('Enter JSON schema...')}
                className="font-mono text-xs"
                rows={6}
                readOnly
              />
            )}
            <span className="text-xs opacity-70">
              {t('JSON schema defining the input parameters for the tool')}
            </span>
          </div>
        </>
      )}
    </div>
  );
};

export default ToolDefinitionEditor;