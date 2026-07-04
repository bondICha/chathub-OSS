import { FC, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { UserConfig, CustomApiProvider, ProviderConfig } from '~services/user-config';
import { getApiSchemeOptions } from './api-scheme-options';
import { Input } from '../Input';
import Select from '../Select';
import Switch from '../Switch';
import Button from '../Button';
import ExpandableDialog from '../ExpandableDialog';
import HostSearchInput from './HostSearchInput';
import BotIcon from '../BotIcon';
import IconSelectModal from './IconSelectModal';
import ModelPreview from './ModelPreview';
import { HiChatBubbleLeftRight, HiPhoto } from 'react-icons/hi2';
import { resolveActiveKeyForProvider, maskKey } from '~/utils/active-api-key';
import { cx } from '~/utils';
interface Props {
  open: boolean;
  onClose: () => void;
  provider: ProviderConfig | null;
  commonApiKey?: string;
  onSave: (provider: ProviderConfig) => void;
}

const ProviderEditModal: FC<Props> = ({ open, onClose, provider, commonApiKey = '', onSave }) => {
  const { t } = useTranslation();
  const [editingProvider, setEditingProvider] = useState<ProviderConfig | null>(null);
  const [iconModalOpen, setIconModalOpen] = useState(false);
  const iconModalClosingRef = useRef(false);

  // Update editingProvider when provider prop changes
  useEffect(() => {
    if (provider) {
      setEditingProvider({ ...provider });
    }
  }, [provider]);

  const handleSave = () => {
    if (editingProvider) {
      if (!editingProvider.apiKey?.trim() && commonApiKey.trim()) {
        if (!window.confirm(t('API Key is empty. Use Common API Key?'))) return;
      }
      onSave(editingProvider);
      onClose();
    }
  };

  const handleClose = () => {
    // 親モーダルのクローズ要求を、子モーダル(アイコン選択)表示/クローズ中は無視
    if (iconModalOpen || iconModalClosingRef.current) return;
    setEditingProvider(null);
    onClose();
  };

  if (!editingProvider || !open) return null;

  const formRowClass = "flex flex-col gap-2";
  const labelClass = "font-medium text-sm";

  return (
    <>
      <ExpandableDialog
        open={open}
        onClose={handleClose}
        title={t('Edit Provider')}
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button
              text={t('Cancel')}
              color="flat"
              onClick={handleClose}
            />
            <Button
              text={t('Save')}
              color="primary"
              onClick={handleSave}
            />
          </div>
        }
      >
        <div className="space-y-4">
          {/* Provider Icon and Name */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 cursor-pointer" onClick={() => setIconModalOpen(true)}>
              <BotIcon iconName={editingProvider.icon} size={64} />
            </div>
            <div className="flex-1">
              <div className={formRowClass}>
                <p className={labelClass}>{t('Provider name')}</p>
                <Input
                  value={editingProvider.name}
                  onChange={(e) => setEditingProvider({ ...editingProvider, name: e.currentTarget.value })}
                  placeholder={t('Provider name')}
                />
              </div>
            </div>
          </div>

          {/* Output Data Type Tabs */}
          <div className={formRowClass}>
            <p className={labelClass}>{t('Output Data Type')}</p>
            <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setEditingProvider({ ...editingProvider, outputType: 'text' })}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                  (editingProvider.outputType || 'text') === 'text'
                    ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <HiChatBubbleLeftRight className="w-4 h-4" />
                Text
              </button>
              <button
                onClick={() => setEditingProvider({ ...editingProvider, outputType: 'image' })}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
                  editingProvider.outputType === 'image'
                    ? 'border-b-2 border-blue-600 text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                }`}
              >
                <HiPhoto className="w-4 h-4" />
                Image (used by Image Agent)
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {editingProvider.outputType === 'image'
                ? t('Dedicated image generation API. Used by Image Agent chatbot via Tool Call.')
                : t('Chat/Completion API. For image generation (e.g., Nanobanana, OpenAI Responses), select Text.')}
            </p>
          </div>

          {/* API Scheme - filtered by Output Type */}
          <div className={formRowClass}>
            <p className={labelClass}>{t('API Scheme')}</p>
            <Select
              options={getApiSchemeOptions().filter(opt => {
                const isImageScheme = [
                  CustomApiProvider.ChutesAI,
                  CustomApiProvider.NovitaAI,
                  CustomApiProvider.Replicate,
                  CustomApiProvider.OpenAI_Image,
                ].includes(opt.value);

                const isImageAgent = opt.value === CustomApiProvider.ImageAgent;

                // Filter based on selected output type
                if (editingProvider.outputType === 'image') {
                  return isImageScheme; // Only show image-specific schemes
                } else {
                  return !isImageScheme && !isImageAgent; // Show text schemes (exclude pure image and agent)
                }
              })}
              value={editingProvider.provider || CustomApiProvider.OpenAI}
              showRecommended={true}
              onChange={(v) => {
                const next = { ...editingProvider, provider: v as CustomApiProvider };

                // Set isHostFullPath for providers that require full path
                if (v === CustomApiProvider.GeminiOpenAI || v === CustomApiProvider.VertexAI_Claude || v === CustomApiProvider.VertexAI_Gemini) {
                  next.isHostFullPath = true;
                }

                // Default Auth mode for Gemini-capable providers
                if (v === CustomApiProvider.VertexAI_Gemini || v === CustomApiProvider.Google) {
                  next.AuthMode = next.AuthMode || 'header';
                }

                // Set default hosts (always overwrite when scheme changes)
                // Image providers
                if (v === CustomApiProvider.NovitaAI) {
                  next.host = 'https://api.novita.ai';
                }
                if (v === CustomApiProvider.ChutesAI) {
                  next.host = 'https://image.chutes.ai';
                }
                if (v === CustomApiProvider.Replicate) {
                  next.host = 'https://api.replicate.com/v1/models/%model/predictions';
                  next.isHostFullPath = true; // Replicate requires full path
                }
                // Chat providers
                if (v === CustomApiProvider.OpenRouter) {
                  next.host = 'https://openrouter.ai/api';
                }
                if (v === CustomApiProvider.QwenOpenAI) {
                  next.host = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
                }
                if (v === CustomApiProvider.GeminiOpenAI) {
                  next.host = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions';
                }

                setEditingProvider(next);
              }}
            />
            {editingProvider.provider === CustomApiProvider.Replicate && editingProvider.outputType === 'image' && (
              <div className="flex items-start gap-2 text-xs text-blue-600 dark:text-blue-400 mt-1">
                <span>💡</span>
                <span>{t('Easy setup with API integration - supports a wide range of models')}</span>
              </div>
            )}
          </div>

          {/* Anthropic Auth Header */}
          {editingProvider.provider === CustomApiProvider.Anthropic && (
            <div className={formRowClass}>
              <p className={labelClass}>{t('Anthropic Auth Header')}</p>
              <Select
                options={[
                  { name: 'x-api-key (Default)', value: 'false' },
                  { name: 'Authorization', value: 'true' }
                ]}
                value={editingProvider.isAnthropicUsingAuthorizationHeader ? 'true' : 'false'}
                onChange={(v) => {
                  setEditingProvider({ 
                    ...editingProvider, 
                    isAnthropicUsingAuthorizationHeader: v === 'true' 
                  });
                }}
                size="small"
              />
            </div>
          )}

          {/* Gemini Auth Mode */}
          {(editingProvider.provider === CustomApiProvider.VertexAI_Gemini || editingProvider.provider === CustomApiProvider.Google) && (
            <div className={formRowClass}>
              <p className={labelClass}>{t('Gemini Auth Mode')}</p>
              <Select
                options={[
                  { name: 'Header Auth (Authorization: <API Key>)', value: 'header' },
                  { name: 'Default (Query Param ?key=API_KEY)', value: 'default' },
                ]}
                value={editingProvider.AuthMode || 'header'}
                onChange={(v) => setEditingProvider({ ...editingProvider, AuthMode: v as any })}
              />
            </div>
          )}

          {/* Gemini Vertex AI Mode */}
          {editingProvider.provider === CustomApiProvider.Google && (
            <div className={formRowClass}>
              <p className={labelClass}>{t('Vertex AI Mode')}</p>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editingProvider.VertexMode ?? false}
                  onChange={(checked) => setEditingProvider({ ...editingProvider, VertexMode: checked })}
                />
                <p className="text-xs opacity-70">
                  {t('Enable for Vertex AI endpoints and Rakuten AI Gateway (requires vertexai=True in SDK)')}
                </p>
              </div>
            </div>
          )}

          {/* API Host */}
          <div className={formRowClass}>
            <div className="flex items-center justify-between">
              <p className={labelClass}>{t(editingProvider.isHostFullPath ? 'API Endpoint (Full Path)' : 'API Host')}</p>
              {(editingProvider.provider === CustomApiProvider.VertexAI_Claude || editingProvider.provider === CustomApiProvider.Replicate) ? (
                <span className="text-sm">{t('Full Path')}</span>
              ) : (
                <div className="flex items-center gap-1">
                  <span className="text-sm">{t('Full Path')}</span>
                  <span className="cursor-help group relative">ⓘ
                    <div className="absolute top-full right-0 mt-2 w-72 hidden group-hover:block bg-gray-900 dark:bg-gray-800 text-white text-xs p-2 rounded shadow-lg z-50">
                      {t('If "Full Path" is ON, enter the complete API endpoint URL. Otherwise, enter only the base host.')}
                    </div>
                  </span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1">
              <HostSearchInput
                  className='w-full'
                  placeholder={
                  editingProvider.provider === CustomApiProvider.NovitaAI ? "https://api.novita.ai" :
                  editingProvider.provider === CustomApiProvider.ChutesAI ? "https://image.chutes.ai" :
                  editingProvider.provider === CustomApiProvider.Replicate ? "https://api.replicate.com/v1/models/%model/predictions" :
                  editingProvider.provider === CustomApiProvider.OpenRouter ? "https://openrouter.ai/api" :
                  editingProvider.provider === CustomApiProvider.Google ? "https://generativelanguage.googleapis.com" :
                  editingProvider.provider === CustomApiProvider.GeminiOpenAI ? "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions" :
                  editingProvider.provider === CustomApiProvider.VertexAI_Gemini ? "https://api-provider.com/google-vertexai/v1/publishers/google/models/%model:generateContent" :
                  editingProvider.provider === CustomApiProvider.QwenOpenAI ? "https://dashscope.aliyuncs.com/compatible-mode/v1" :
                  editingProvider.isHostFullPath ? (
                    editingProvider.provider === CustomApiProvider.OpenAI_Responses ? "https://api.example.com/v1/responses" :
                    editingProvider.provider === CustomApiProvider.OpenAI_Image ? "https://api.example.com/v1/responses" :
                    "https://api.example.com/v1/chat/completions"
                  ) :
                  "https://api.example.com"
                  }
                  value={editingProvider.host}
                  onChange={(value) => {
                    setEditingProvider({ ...editingProvider, host: value });
                  }}
                />
                {(editingProvider.provider === CustomApiProvider.VertexAI_Gemini || editingProvider.provider === CustomApiProvider.VertexAI_Claude) && (
                  <>
                    <p className="text-xs opacity-70 mt-1 break-words">
                      {t('vertex_path_model_hint')}
                    </p>
                    {editingProvider.provider === CustomApiProvider.VertexAI_Gemini && (
                      <p className="text-xs opacity-70 mt-1 break-words">
                        {t('vertex_gemini_nonstream_notice')}
                      </p>
                    )}
                  </>
                )}
                {editingProvider.outputType === 'image' && (() => {
                  const getProviderHelpText = () => {
                    switch (editingProvider.provider) {
                      case CustomApiProvider.NovitaAI:
                        return t('Base URL only. Model-specific endpoints (e.g., /v3/async/qwen-image-txt2img) are automatically selected.');
                      case CustomApiProvider.ChutesAI:
                        return t('Base URL only. The /generate endpoint is automatically appended.');
                      case CustomApiProvider.Replicate:
                        return t('Full path required. Use %model as placeholder for model name (e.g., /v1/models/%model/predictions). The model name will be URL-encoded at request time.');
                      default:
                        return t('Base URL only. Specific endpoints are automatically selected based on the model.');
                    }
                  };
                  return (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      ℹ️ {getProviderHelpText()}
                    </p>
                  );
                })()}
              </div>
              {editingProvider.provider !== CustomApiProvider.VertexAI_Claude &&
               editingProvider.provider !== CustomApiProvider.GeminiOpenAI &&
               editingProvider.provider !== CustomApiProvider.Replicate && (
                <Switch
                  checked={editingProvider.isHostFullPath ?? false}
                  onChange={(checked) => {
                    setEditingProvider({ ...editingProvider, isHostFullPath: checked });
                  }}
                />
              )}
            </div>
          </div>

          {/* API Key */}
          <div className={formRowClass}>
            <p className={labelClass}>API Key</p>
            {(() => {
              const active = resolveActiveKeyForProvider(editingProvider, commonApiKey);
              const showBadge = active.source !== 'individual';
              const badgeColor = active.source === 'common'
                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
              return (
                <>
                  <Input
                    className="w-full"
                    placeholder={t('Enter API Key for this provider')}
                    value={editingProvider.apiKey || ''}
                    onChange={(e) => setEditingProvider({ ...editingProvider, apiKey: e.currentTarget.value })}
                    type="password"
                  />
                  {showBadge && (
                    <div className="mt-1.5">
                      <span className={cx('text-[11px] px-2 py-0.5 rounded-sm font-medium', badgeColor)}>
                        {active.source === 'common' ? `${t('Active Key')}: ${t('Common')} (${maskKey(commonApiKey)})` : t('No API Key configured')}
                      </span>
                    </div>
                  )}
                </>
              );
            })()}
          </div>

          {/* Model Preview */}
          <div className="border-t pt-4">
            <ModelPreview
              provider={editingProvider.provider || CustomApiProvider.OpenAI}
              apiKey={resolveActiveKeyForProvider(editingProvider, commonApiKey).key}
              host={editingProvider.host}
              isHostFullPath={editingProvider.isHostFullPath}
            />
          </div>
        </div>
      </ExpandableDialog>

      <IconSelectModal
        open={iconModalOpen}
        onClose={() => {
          // Prevent parent modal from closing when child modal (icon selector) is closing
          iconModalClosingRef.current = true;
          setIconModalOpen(false);
          // reset guard after the child modal fully unmounts/animations complete
          setTimeout(() => {
            iconModalClosingRef.current = false;
          }, 300);
        }}
        value={editingProvider.icon || ''}
        onChange={(val) => {
          setEditingProvider({ ...editingProvider, icon: val });
        }}
      />
    </>
  );
};

export default ProviderEditModal;
