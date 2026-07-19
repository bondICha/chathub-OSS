import { FC, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ExpandableDialog from '../ExpandableDialog';
import Button from '../Button';
import { getUserConfig, CustomApiProvider, ProviderConfig } from '~services/user-config';
import { OpenAIModel } from '~services/sst-service';
import { cx } from '~/utils';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onTranscribe: (provider: 'openai' | 'gemini' | 'none', modelOrBotId: string, providerIdOrBotIndex: string) => void;
}

type ProviderType = 'openai' | 'gemini' | 'none';

const OPENAI_MODELS: { id: OpenAIModel; name: string }[] = [
  { id: 'whisper-1', name: 'Whisper-1' },
  { id: 'gpt-4o-mini-transcribe', name: 'GPT-4o Mini' },
  { id: 'gpt-4o-transcribe', name: 'GPT-4o' },
  { id: 'gpt-4o-transcribe-diarize', name: 'GPT-4o Diarize' },
];

const STORAGE_KEY = 'huddlellm_transcribe_settings';

interface TranscribeSettings {
  provider: ProviderType;
  openaiModel: OpenAIModel;
  geminiBotId: string;
}

const TranscribeModal: FC<Props> = ({ isOpen, onClose, onTranscribe }) => {
  const { t } = useTranslation();
  // Default to Gemini as the primary (left) option
  const [provider, setProvider] = useState<ProviderType>('gemini');
  const [openaiModel, setOpenaiModel] = useState<OpenAIModel>('whisper-1');
  const [geminiBots, setGeminiBots] = useState<{ index: number; name: string }[]>([]);
  const [selectedGeminiBot, setSelectedGeminiBot] = useState<string>(''); // index as string
  
  const [openaiProviders, setOpenaiProviders] = useState<ProviderConfig[]>([]);
  const [selectedOpenaiProviderId, setSelectedOpenaiProviderId] = useState<string>('');
  
  const [hasOpenAIKey, setHasOpenAIKey] = useState(false);

  useEffect(() => {
    const loadConfig = async () => {
      const config = await getUserConfig();
      
      // Load OpenAI Providers (all OpenAI-compatible providers support Whisper API)
      const providers = config.providerConfigs?.filter(p =>
        p.provider === CustomApiProvider.OpenAI ||
        p.provider === CustomApiProvider.OpenAI_Responses ||
        p.provider === CustomApiProvider.OpenRouter
      ) || [];
      
      // Add legacy/default customApiKey as a provider if it exists and not already covered
      // Actually getUserConfig migrates customApiKey to providerConfigs, so checking providerConfigs should be enough.
      // But let's check just in case or if migration logic handles it differently.
      // Assuming getUserConfig returns clean providerConfigs.
      
      setOpenaiProviders(providers);
      setHasOpenAIKey(providers.length > 0);

      // Load Gemini Bots
      let geminiBotCandidates: { index: number; name: string }[] = [];
      if (config.customApiConfigs) {
        const bots = config.customApiConfigs
          .map((c, index) => {
            // Resolve provider
            let provider = c.provider;
            if (c.providerRefId && config.providerConfigs) {
              const refProvider = config.providerConfigs.find(p => p.id === c.providerRefId);
              if (refProvider) {
                provider = refProvider.provider;
              }
            }
            return { c, index, provider };
          })
          .filter(({ provider }) => provider === CustomApiProvider.Google || provider === CustomApiProvider.VertexAI_Gemini)
          .map(({ c, index }) => ({
            index,
            name: c.name || `Gemini Bot ${index + 1}`
          }));
        
        setGeminiBots(bots);
        geminiBotCandidates = bots;
      }

      // Load saved settings
      const savedSettingsStr = localStorage.getItem(STORAGE_KEY);
      if (savedSettingsStr) {
        try {
          const saved: TranscribeSettings = JSON.parse(savedSettingsStr);
          if (saved.provider) setProvider(saved.provider);
          if (saved.openaiModel) setOpenaiModel(saved.openaiModel);
          // Only restore bot/provider selection if valid
          if (saved.provider === 'gemini') {
             if (saved.geminiBotId) setSelectedGeminiBot(saved.geminiBotId);
          } 
        } catch {
          // Ignore malformed localStorage; fall back to defaults
        }
      }

      // If OpenAI is not configured, default to Gemini provider
      if (providers.length === 0 && geminiBotCandidates.length > 0) {
        setProvider('gemini');
      }
    };
    
    if (isOpen) {
      loadConfig();
    }
  }, [isOpen]);

  // Set default selections if empty
  useEffect(() => {
    if (provider === 'openai' && !selectedOpenaiProviderId && openaiProviders.length > 0) {
      setSelectedOpenaiProviderId(openaiProviders[0].id);
    }
    if (provider === 'gemini' && !selectedGeminiBot && geminiBots.length > 0) {
      setSelectedGeminiBot(geminiBots[0].index.toString());
    }
  }, [provider, openaiProviders, geminiBots, selectedOpenaiProviderId, selectedGeminiBot]);

  const handleTranscribe = () => {
    // Save settings
    const settings: TranscribeSettings = {
      provider,
      openaiModel,
      geminiBotId: selectedGeminiBot
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));

    if (provider === 'none') {
      // Skip transcription - just attach audio file without transcript
      onTranscribe('none' as any, '', '');
    } else if (provider === 'openai') {
      if (!selectedOpenaiProviderId) {
        console.error('No OpenAI provider selected');
        return;
      }
      // Pass provider ID instead of API key
      onTranscribe('openai', openaiModel, selectedOpenaiProviderId);
    } else {
      onTranscribe('gemini', 'unused', selectedGeminiBot);
    }
    onClose();
  };

  return (
    <ExpandableDialog
      open={isOpen}
      onClose={onClose}
      title={t('Transcribe Audio')}
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button text={t('Cancel')} onClick={onClose} color="flat" />
          <Button
            text={provider === 'none' ? t('Attach without transcription') : t('Transcribe')}
            onClick={handleTranscribe}
            color="primary"
            disabled={
              (provider === 'openai' && !selectedOpenaiProviderId) ||
              (provider === 'gemini' && !selectedGeminiBot)
            }
          />
        </div>
      }
    >
      <div className="p-4 flex flex-col gap-6">
        {/* Provider Selection (Gemini | OpenAI | None) */}
        <div className="flex flex-col gap-2">
          <label className="text-sm font-bold text-primary-text">{t('Select Provider')}</label>
          <div className="flex gap-2">
            <button
              className={cx(
                "flex-1 py-2 px-4 rounded-md border text-sm font-medium transition-colors",
                provider === 'gemini'
                  ? "bg-primary-blue text-white border-primary-blue"
                  : "bg-transparent text-primary-text border-primary-border hover:bg-primary-border/20"
              )}
              onClick={() => setProvider('gemini')}
            >
              <div className="flex items-center justify-center gap-2">
                <span>Gemini</span>
                <span className={cx(
                  "text-xs font-semibold px-2 py-0.5 rounded-full",
                  provider === 'gemini'
                    ? "bg-white/20 text-white"
                    : "bg-primary-blue/10 text-primary-blue border border-primary-blue/30"
                )}>
                  {t('Recommended')}
                </span>
              </div>
            </button>
            <button
              className={cx(
                "flex-1 py-2 px-4 rounded-md border text-sm font-medium transition-colors",
                provider === 'openai'
                  ? "bg-primary-blue text-white border-primary-blue"
                  : "bg-transparent text-primary-text border-primary-border hover:bg-primary-border/20"
              )}
              onClick={() => hasOpenAIKey && setProvider('openai')}
              disabled={!hasOpenAIKey}
            >
              OpenAI
              {!hasOpenAIKey && <span className="block text-xs font-normal opacity-70">({t('Not configured')})</span>}
            </button>
            <button
              className={cx(
                "flex-1 py-2 px-4 rounded-md border text-sm font-medium transition-colors",
                provider === 'none'
                  ? "bg-primary-blue text-white border-primary-blue"
                  : "bg-transparent text-primary-text border-primary-border hover:bg-primary-border/20"
              )}
              onClick={() => setProvider('none')}
            >
              None
            </button>
          </div>
        </div>

        {provider === 'openai' && (
          <>
            {/* OpenAI API Configuration Selection */}
            {openaiProviders.length >= 1 && (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-primary-text">{t('Select OpenAI Provider')}</label>
                <select
                  value={selectedOpenaiProviderId}
                  onChange={(e) => setSelectedOpenaiProviderId(e.target.value)}
                  className="p-2 rounded border border-primary-border bg-primary-background text-primary-text focus:outline-none focus:border-primary"
                >
                  {openaiProviders.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Model Selection (Button Group) */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-primary-text">{t('Select Model')}</label>
              <div className="grid grid-cols-2 gap-2">
                {OPENAI_MODELS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => setOpenaiModel(m.id)}
                    className={cx(
                      "py-2 px-2 rounded-md border text-xs font-medium transition-all text-center",
                      openaiModel === m.id
                        ? "bg-primary-blue text-white border-primary-blue"
                        : "bg-transparent text-secondary-text border-primary-border hover:border-primary-blue/50"
                    )}
                  >
                    {m.name}
                  </button>
                ))}
              </div>
              <p className="text-xs text-secondary-text mt-1">
                {openaiModel === 'whisper-1' && t('Classic Whisper model. Good balance.')}
                {openaiModel === 'gpt-4o-transcribe-diarize' && t('GPT-4o with speaker identification (diarization).')}
                {(openaiModel === 'gpt-4o-mini-transcribe' || openaiModel === 'gpt-4o-transcribe') && t('Newer models may offer better accuracy.')}
              </p>
            </div>
            <div className="flex flex-col gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-md">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                ℹ️ {t('Audio-capable AIs (e.g., Gemini) will receive the audio file directly. Transcribed text will be sent to other AIs (Claude, GPT, etc.).')}
              </p>
            </div>
          </>
        )}

        {provider === 'gemini' && (
          <>
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-primary-text">{t('Select Gemini Bot')}</label>
              {geminiBots.length > 0 ? (
                <select
                  value={selectedGeminiBot}
                  onChange={(e) => setSelectedGeminiBot(e.target.value)}
                  className="p-2 rounded border border-primary-border bg-primary-background text-primary-text focus:outline-none focus:border-primary"
                >
                  {geminiBots.map(b => (
                    <option key={b.index} value={b.index.toString()}>{b.name}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-red-500">{t('No Gemini bots configured.')}</p>
              )}
              <p className="text-xs text-secondary-text">
                {t('The selected Gemini bot will be used to transcribe the audio.')}
              </p>
            </div>
            <div className="flex flex-col gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-md">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                ℹ️ {t('Audio-capable AIs (e.g., Gemini) will receive the audio file directly. Transcribed text will be sent to other AIs (Claude, GPT, etc.).')}
              </p>
            </div>
          </>
        )}

        {provider === 'none' && (
          <div className="flex flex-col gap-2 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700 rounded-md">
            <p className="text-sm text-yellow-800 dark:text-yellow-300 font-semibold">
              ⚠️ {t('Warning')}
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-400">
              {t('Without transcription, the audio file will only be sent to audio-capable AIs (e.g., Gemini). Other AIs (Claude, GPT, etc.) will not receive the audio content.')}
            </p>
          </div>
        )}
      </div>
    </ExpandableDialog>
  );
};

export default TranscribeModal;
