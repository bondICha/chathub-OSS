import { FC, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BiPlus, BiTrash, BiEdit } from 'react-icons/bi';
import toast from 'react-hot-toast';
import { UserConfig, CustomApiProvider, ProviderConfig } from '~services/user-config';
import { PROVIDER_DEFAULTS } from '~/../config/providers/provider-defaults';
import { getApiSchemeOptions } from './api-scheme-options';
import Button from '../Button';
import Blockquote from './Blockquote';
import IconSelectModal from './IconSelectModal';
import BotIcon from '../BotIcon';
import ProviderEditModal from './ProviderEditModal';
import CopyIcon from '../icons/CopyIcon';
import { resolveActiveKeyForProvider, maskKey } from '~/utils/active-api-key';
import { cx } from '~/utils';

interface Props {
  userConfig: UserConfig;
  updateConfigValue: (update: Partial<UserConfig>) => void;
}

const ApiProviderSettings: FC<Props> = ({ userConfig, updateConfigValue }) => {
  const { t } = useTranslation();
  const [providerIconEditIndex, setProviderIconEditIndex] = useState<number | null>(null);
  const [editingProviderIndex, setEditingProviderIndex] = useState<number | null>(null);

  const providerConfigs = userConfig.providerConfigs || [];

  const updateProviderConfigs = (newProviders: ProviderConfig[]) => {
    updateConfigValue({ providerConfigs: newProviders });
  };

  const genId = () => `prov_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const createDefaultProvider = (
    baseProvider: CustomApiProvider = CustomApiProvider.OpenAI,
    name?: string,
  ): ProviderConfig => {
    const providerDefaults = PROVIDER_DEFAULTS[baseProvider];
    const schemeOption = getApiSchemeOptions().find(opt => opt.value === baseProvider);

    return {
      id: genId(),
      name: name || `Provider ${providerConfigs.length + 1}`,
      provider: baseProvider,
      host: providerDefaults?.host ?? '',
      isHostFullPath: providerDefaults?.isHostFullPath ?? false,
      apiKey: '',
      icon: 'OpenAI.Black',
      isAnthropicUsingAuthorizationHeader: false,
      outputType: schemeOption?.outputType,
    };
  };

  const formRowClass = "flex flex-col gap-2";
  const labelClass = "font-medium text-sm";
  const inputContainerClass = "flex-1";

  const resolveProviderMode = (prov: ProviderConfig): 'chat' | 'image' => {
    return prov.outputType === 'image' ? 'image' : 'chat';
  };

  const schemeLookup = useMemo(() => {
    const map = new Map<CustomApiProvider, string>();
    getApiSchemeOptions().forEach(opt => {
      map.set(opt.value, opt.name);
    });
    return map;
  }, []);

  const getProviderScheme = (prov: ProviderConfig) => {
    return schemeLookup.get(prov.provider) || prov.provider;
  };

  const usageByProviderId = useMemo(() => {
    const map = new Map<string, { index: number; name: string; avatar: string }[]>();
    (userConfig.customApiConfigs || []).forEach((bot, idx) => {
      if (!bot.providerRefId) return;
      const list = map.get(bot.providerRefId) ?? [];
      list.push({ index: idx, name: bot.name, avatar: bot.avatar });
      map.set(bot.providerRefId, list);
    });
    return map;
  }, [userConfig.customApiConfigs]);

  const scrollToChatbot = (index: number) => {
    const el = document.getElementById(`chatbot-setting-${index}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <div className="p-4 rounded-lg bg-white/20 dark:bg-black/20 border border-gray-300 dark:border-gray-700 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-md font-semibold">{t('API Providers')}</h3>
          <Button
            size="small"
            text={t('Add Provider')}
            icon={<BiPlus />}
            onClick={() => {
              const defProvider = createDefaultProvider(CustomApiProvider.OpenAI);
              updateProviderConfigs([...providerConfigs, defProvider]);
            }}
            color="primary"
          />
        </div>
        <Blockquote>{t('Manage your API provider configurations here. These can be referenced by individual chatbots.')}</Blockquote>

        <div className="flex flex-col gap-3">
          {providerConfigs.map((prov, pIndex) => {
            const active = resolveActiveKeyForProvider(prov, userConfig.customApiKey || '');
            const usingIndividual = active.source === 'individual';
            const usingCommon = active.source === 'common';
            const apiKeyBadgeColor = usingIndividual
              ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
              : usingCommon
                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
            const apiKeyText = usingIndividual
              ? `${t('Active Key')}: ${t('Individual')}`
              : usingCommon
                ? `${t('Active Key')}: ${t('Common')} (${maskKey(userConfig.customApiKey || '')})`
                : t('No API Key configured');
            return (
            <div key={prov.id} id={`provider-setting-${pIndex}`} className="scroll-mt-3 bg-white/30 dark:bg-black/30 border border-gray-300 dark:border-gray-700 rounded-lg shadow transition-all">
              <div className="p-3 grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
                {/* Icon + Name (+ inline badges) */}
                <div className="lg:col-span-4 flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 cursor-pointer flex-shrink-0" onClick={() => setProviderIconEditIndex(pIndex)}>
                    <BotIcon iconName={prov.icon} size={32} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="font-medium text-sm truncate">{prov.name}</h4>
                      {resolveProviderMode(prov) === 'image' && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-600 dark:text-violet-300 border border-violet-400/40 whitespace-nowrap flex-shrink-0">
                          {t('Image')}
                        </span>
                      )}
                      {prov.provider === CustomApiProvider.Replicate && resolveProviderMode(prov) === 'image' && (
                        <span className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-1.5 py-0.5 rounded whitespace-nowrap flex-shrink-0">
                          {t('Recommended')}
                        </span>
                      )}
                    </div>
                    <p className="text-xs opacity-60 truncate">{getProviderScheme(prov)}</p>
                  </div>
                  <span className="text-xs font-mono opacity-40 flex-shrink-0">#{pIndex + 1}</span>
                </div>

                {/* Host display - 全文表示・折り返し可、視覚的に大きめ */}
                <div className="lg:col-span-6 min-w-0">
                  <p className="text-[10px] uppercase tracking-wide opacity-50 mb-0.5">Host</p>
                  <p className="text-sm font-mono break-all leading-snug">{prov.host || <span className="opacity-50 italic">{t('Not set')}</span>}</p>
                </div>

                {/* API Key status */}
                <div className="lg:col-span-2 min-w-0">
                  <span className={cx('inline-block text-[10px] px-1.5 py-0.5 rounded-sm font-medium break-all max-w-full', apiKeyBadgeColor)} title={apiKeyText}>
                    {apiKeyText}
                  </span>
                </div>

                {/* Replicate hint (only when applicable) */}
                {prov.provider === CustomApiProvider.Replicate && resolveProviderMode(prov) === 'image' && (
                  <div className="lg:col-span-12 text-xs text-blue-600 dark:text-blue-400">
                    💡 {t('Easy setup with API integration - supports a wide range of models')}
                  </div>
                )}

                {/* Used by chatbots */}
                {(() => {
                  const usedBy = usageByProviderId.get(prov.id) ?? [];
                  return (
                    <div className="lg:col-span-12 min-w-0 pt-1 border-t border-gray-300/40 dark:border-gray-700/40">
                      <div className="flex items-start gap-2 flex-wrap">
                        <p className="text-[10px] uppercase tracking-wide opacity-60 mt-1 flex-shrink-0">
                          {t('Used by')}
                        </p>
                        {usedBy.length === 0 ? (
                          <span className="text-xs italic opacity-50 mt-0.5">
                            {t('Not used by any chatbot')}
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1.5 flex-1 min-w-0">
                            {usedBy.map((bot) => (
                              <button
                                key={bot.index}
                                type="button"
                                onClick={() => scrollToChatbot(bot.index)}
                                title={t('Click to jump to settings')}
                                className="flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800/50 transition-colors max-w-[12rem]"
                              >
                                <span className="w-4 h-4 flex-shrink-0">
                                  <BotIcon iconName={bot.avatar} size={16} />
                                </span>
                                <span className="truncate">{bot.name}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Bottom row: actions + Edit Provider */}
                <div className="lg:col-span-12 flex items-center justify-between gap-2 -mt-1">
                  <div className="flex items-center gap-0.5">
                    <button
                      className={`p-1.5 rounded ${pIndex === 0 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/20'}`}
                      onClick={() => {
                        if (pIndex > 0) {
                          const updated = [...providerConfigs];
                          [updated[pIndex - 1], updated[pIndex]] = [updated[pIndex], updated[pIndex - 1]];
                          updateProviderConfigs(updated);
                        }
                      }}
                      disabled={pIndex === 0}
                      title={t('Move up')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16"><path fillRule="evenodd" d="M8 15a.5.5 0 0 0 .5-.5V2.707l3.146 3.147a.5.5 0 0 0 .708-.708l-4-4a.5.5 0 0 0-.708 0l-4 4a.5.5 0 1 0 .708.708L7.5 2.707V14.5a.5.5 0 0 0 .5.5z" /></svg>
                    </button>
                    <button
                      className={`p-1.5 rounded ${pIndex === providerConfigs.length - 1 ? 'opacity-30 cursor-not-allowed' : 'hover:bg-white/20'}`}
                      onClick={() => {
                        if (pIndex < providerConfigs.length - 1) {
                          const updated = [...providerConfigs];
                          [updated[pIndex], updated[pIndex + 1]] = [updated[pIndex + 1], updated[pIndex]];
                          updateProviderConfigs(updated);
                        }
                      }}
                      disabled={pIndex === providerConfigs.length - 1}
                      title={t('Move down')}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" fill="currentColor" viewBox="0 0 16 16"><path fillRule="evenodd" d="M8 1a.5.5 0 0 1 .5.5v11.793l3.146-3.147a.5.5 0 0 1 .708.708l-4 4a.5.5 0 0 1-.708 0l-4-4a.5.5 0 0 1 .708-.708L7.5 13.293V1.5A.5.5 0 0 1 8 1z" /></svg>
                    </button>
                    <button
                      className="p-1.5 rounded hover:bg-white/20"
                      onClick={() => {
                        const copy = { ...prov, id: genId(), name: `${prov.name} Copy` };
                        updateProviderConfigs([
                          ...providerConfigs.slice(0, pIndex + 1),
                          copy,
                          ...providerConfigs.slice(pIndex + 1),
                        ]);
                      }}
                      title={t('Duplicate')}
                    >
                      <CopyIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      className="p-1.5 rounded hover:bg-white/20 text-red-400"
                      onClick={() => {
                        if (!window.confirm(t('Are you sure you want to delete this provider?'))) return;
                        const updatedProviders = [...providerConfigs];
                        updatedProviders.splice(pIndex, 1);
                        const updatedBots = (userConfig.customApiConfigs || []).map((c) => {
                          if (c.providerRefId === prov.id) return { ...c, providerRefId: undefined };
                          return c;
                        });
                        updateConfigValue({
                          providerConfigs: updatedProviders,
                          customApiConfigs: updatedBots,
                        });
                        toast.success(t('Provider deleted. Bots referencing it have been switched to individual settings.'));
                      }}
                      title={t('Delete')}
                    >
                      <BiTrash size={14} />
                    </button>
                  </div>
                  <Button
                    size="small"
                    text={t('Edit Provider')}
                    icon={<BiEdit />}
                    onClick={() => setEditingProviderIndex(pIndex)}
                    color="primary"
                  />
                </div>
              </div>
            </div>
          );})}
        </div>
      </div>

      <IconSelectModal
        open={providerIconEditIndex !== null}
        onClose={() => setProviderIconEditIndex(null)}
        value={providerIconEditIndex !== null ? providerConfigs[providerIconEditIndex]?.icon || '' : ''}
        onChange={(val) => {
          if (providerIconEditIndex !== null) {
            const updated = [...providerConfigs];
            updated[providerIconEditIndex] = { ...updated[providerIconEditIndex], icon: val };
            updateProviderConfigs(updated);
          }
        }}
      />

      <ProviderEditModal
        open={editingProviderIndex !== null}
        onClose={() => setEditingProviderIndex(null)}
        provider={editingProviderIndex !== null ? providerConfigs[editingProviderIndex] : null}
        commonApiKey={userConfig.customApiKey || ''}
        onSave={(updatedProvider) => {
          if (editingProviderIndex !== null) {
            const updated = [...providerConfigs];
            updated[editingProviderIndex] = updatedProvider;
            updateProviderConfigs(updated);
            toast.success(t('Provider updated successfully'));
          }
        }}
      />
    </>
  );
};

export default ApiProviderSettings;
