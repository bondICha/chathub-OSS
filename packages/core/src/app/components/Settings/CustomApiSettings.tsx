import { FC, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import Browser from 'webextension-polyfill';
import { UserConfig, ProviderConfig, CustomApiProvider } from '~services/user-config';
import Dialog from '../Dialog';
import Button from '../Button';
import Blockquote from './Blockquote';
import { BiInfoCircle } from 'react-icons/bi';
import { Input, Textarea } from '../Input';
import { getSystemPrompt, SYSTEM_PROMPTS, SYSTEM_PROMPT_VERSION } from '~app/system-prompts';
import { getSystemPromptBackup } from '~services/system-prompt-version';
import ApiProviderSettings from './ApiProviderSettings';
import ChatbotSettings from './ChatbotSettings';
import RelationshipMap from './RelationshipMap';
import Switch from '../Switch';
import HostSearchInput from './HostSearchInput';

interface Props {
  userConfig: UserConfig;
  updateConfigValue: (update: Partial<UserConfig>) => void;
}

const CustomAPISettings: FC<Props> = ({ userConfig, updateConfigValue }) => {
  const { t } = useTranslation();
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [showVariables, setShowVariables] = useState(false);
  const [showBackupDialog, setShowBackupDialog] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [backupPrompt, setBackupPrompt] = useState<string | undefined>(undefined);

  // Load current system prompt version
  useEffect(() => {
    const loadVersion = async () => {
      const { lastSystemPromptVersion } = await Browser.storage.sync.get('lastSystemPromptVersion');
      setCurrentVersion(lastSystemPromptVersion || 'Unknown');
    };
    loadVersion();
  }, []);

  const resetToDefaultSystemMessage = async (lang: 'en' | 'ja' | 'zh-CN' | 'zh-TW') => {
    // 現在のプロンプトをバックアップとして保存 (local storage)
    await Browser.storage.local.set({ systemPromptBackup: userConfig.commonSystemMessage });

    updateConfigValue({ commonSystemMessage: SYSTEM_PROMPTS[lang] });
    // Update version when reset
    await Browser.storage.sync.set({ lastSystemPromptVersion: SYSTEM_PROMPT_VERSION });
    setCurrentVersion(SYSTEM_PROMPT_VERSION);
    setShowResetDialog(false);
    toast.success(t('Common System Message has been reset to default'));
  };

  const handleViewBackup = async () => {
    const backup = await getSystemPromptBackup();
    setBackupPrompt(backup);
    setShowBackupDialog(true);
  };

  const formRowClass = "flex flex-col gap-2";
  const labelClass = "font-medium text-sm";

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg relative">
        <div className="absolute inset-0 bg-white/10 dark:bg-black/20 rounded-lg pointer-events-none"></div>
        <div className="relative">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold">{t('Chatbots configuration')}</h2>
          </div>
          <div className="flex flex-col gap-3">
            <div id="section-common" className="scroll-mt-3 p-4 rounded-lg bg-white/20 dark:bg-black/20 border border-gray-300 dark:border-gray-700 space-y-4">
              <h3 className="text-md font-semibold">{t('Common Settings')}</h3>
              <Blockquote>{t('These settings are used by all custom chatbots. Individual chatbot settings will override these.')}</Blockquote>
              <div className="space-y-3">
                {/* Common System Message */}
                <div className={formRowClass}>
                  <div className="flex items-center justify-between">
                    <p className={labelClass}>{t('Common System Message')}</p>
                  </div>
                  <div className="w-full">
                    <button onClick={() => setShowVariables(!showVariables)} className="flex items-center gap-1 opacity-70 hover:opacity-90 cursor-pointer transition-opacity mb-2">
                      <BiInfoCircle className="w-4 h-4" />
                      <span className="text-xs">{showVariables ? t('Hide') : t('Show available variables')}</span>
                    </button>
                    <div className="flex flex-col gap-2 w-full">
                      {showVariables && (
                        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border">
                          <p className="font-medium mb-2 text-sm">{t('Variables description')}</p>
                          <div className="grid grid-cols-1 gap-1 text-xs">
                            <div className="flex items-center gap-2">
                              <code className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-1 rounded">{'{current_date}'}</code>
                              <span className="opacity-70">- Current date (YYYY-MM-DD)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <code className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-1 rounded">{'{current_time}'}</code>
                              <span className="opacity-70">- Current time (HH:MM:SS)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <code className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-1 rounded">{'{modelname}'}</code>
                              <span className="opacity-70">- AI model name</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <code className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-1 rounded">{'{chatbotname}'}</code>
                              <span className="opacity-70">- Chatbot display name</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <code className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-1 rounded">{'{language}'}</code>
                              <span className="opacity-70">- User language setting</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <code className="bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-1 rounded">{'{timezone}'}</code>
                              <span className="opacity-70">- User timezone</span>
                            </div>
                          </div>
                        </div>
                      )}
                      <Textarea
                        className='w-full'
                        maxRows={5}
                        value={userConfig.commonSystemMessage}
                        onChange={(e) => updateConfigValue({ commonSystemMessage: e.currentTarget.value })}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <Button
                            text={t('Reset Common system prompt to default')}
                            color="flat"
                            size="small"
                            onClick={() => setShowResetDialog(true)}
                          />
                          <Button
                            text={t('View previous backup prompt')}
                            color="flat"
                            size="small"
                            onClick={handleViewBackup}
                          />
                        </div>
                        <div className="text-xs opacity-60">
                          <span>Current: {currentVersion}</span>
                          <span className="mx-2">|</span>
                          <span>Latest: {SYSTEM_PROMPT_VERSION}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Common API Key + Host (paired side by side on wide screens) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
                  <div className={formRowClass}>
                    <p className={labelClass}>{t('Common API Key')}</p>
                    <div className="flex-1">
                      <Input
                        className="w-full"
                        placeholder="AIxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                        value={userConfig.customApiKey}
                        onChange={(e) => updateConfigValue({ customApiKey: e.currentTarget.value })}
                        type="password"
                      />
                    </div>
                    <Blockquote className="mt-1">{t('Your keys are stored locally')}</Blockquote>
                  </div>

                  <div className={formRowClass}>
                    <div className="flex items-center justify-between">
                      <p className={labelClass}>
                        {t(userConfig.isCustomApiHostFullPath ? 'API Endpoint (Full Path)' : 'Common API Host')}
                      </p>
                      <div className="flex items-center gap-1">
                        <span className="text-sm">{t('Full Path')}</span>
                        <span className="cursor-help group relative">ⓘ
                          <div className="absolute top-full right-0 mt-2 w-72 hidden group-hover:block bg-gray-900 dark:bg-gray-800 text-white text-xs p-2 rounded shadow-lg z-50">
                            {t('Full Path Tooltip Common')}
                          </div>
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <HostSearchInput
                        className="flex-1"
                        placeholder={userConfig.isCustomApiHostFullPath ? t('Host Placeholder Full Path Common') : "https://api.openai.com"}
                        value={userConfig.customApiHost}
                        onChange={(value) => updateConfigValue({ customApiHost: value })}
                      />
                      <Switch
                        checked={userConfig.isCustomApiHostFullPath ?? false}
                        onChange={(checked) => updateConfigValue({ isCustomApiHostFullPath: checked })}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div id="section-relationships" className="scroll-mt-3">
              <RelationshipMap
                providers={userConfig.providerConfigs || []}
                bots={userConfig.customApiConfigs || []}
              />
            </div>

            <div id="section-providers" className="scroll-mt-3">
              <ApiProviderSettings userConfig={userConfig} updateConfigValue={updateConfigValue} />
            </div>

            <hr className="border-gray-300 dark:border-gray-700" />

            <div id="section-chatbots" className="scroll-mt-3">
              <ChatbotSettings userConfig={userConfig} updateConfigValue={updateConfigValue} />
            </div>

          </div>
        </div>
      </div>

      <Dialog title={t('Reset to HuddleLLM default prompt')} open={showResetDialog} onClose={() => setShowResetDialog(false)}>
        <div className="space-y-4">
          <p>{t('Select the language for the default system prompt:')}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button
              text="English"
              color="primary"
              onClick={() => resetToDefaultSystemMessage('en')}
            />
            <Button
              text="日本語"
              color="primary"
              onClick={() => resetToDefaultSystemMessage('ja')}
            />
            <Button
              text="简体中文"
              color="primary"
              onClick={() => resetToDefaultSystemMessage('zh-CN')}
            />
            <Button
              text="繁體中文"
              color="primary"
              onClick={() => resetToDefaultSystemMessage('zh-TW')}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-300 dark:border-gray-700">
            <Button text={t('Cancel')} color="flat" onClick={() => setShowResetDialog(false)} />
          </div>
        </div>
      </Dialog>

      <Dialog title={t('Previous System Prompt Backup')} open={showBackupDialog} onClose={() => setShowBackupDialog(false)}>
        <div className="space-y-4">
          {backupPrompt ? (
            <>
              <p className="text-sm opacity-70">{t('This is your system prompt before the last update. You can copy and restore it manually if needed.')}</p>
              <div className="max-h-96 overflow-y-auto p-3 bg-gray-100 dark:bg-gray-800 rounded border border-gray-300 dark:border-gray-700 custom-scrollbar">
                <pre className="text-xs whitespace-pre-wrap break-words">{backupPrompt}</pre>
              </div>
            </>
          ) : (
            <p className="text-sm opacity-70">{t('No backup found. Backups are created when you update your system prompt.')}</p>
          )}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-300 dark:border-gray-700">
            <Button text={t('Close')} color="flat" onClick={() => setShowBackupDialog(false)} />
          </div>
        </div>
      </Dialog>
    </>
  );
};

export default CustomAPISettings;