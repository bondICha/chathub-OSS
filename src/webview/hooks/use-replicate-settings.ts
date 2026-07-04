import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { CustomApiConfig, CustomApiProvider } from '~services/user-config';
import { fetchReplicateModelSchema } from '~utils/replicate-model-fatcher';
import type { ProviderConfig } from '~services/user-config';

interface Props {
  customApiConfigs: CustomApiConfig[];
  updateCustomApiConfigs: (newConfigs: CustomApiConfig[]) => void;
  userConfig: {
    customApiConfigs: CustomApiConfig[];
    providerConfigs?: ProviderConfig[];
  };
}

export const useReplicateSettings = ({ customApiConfigs, updateCustomApiConfigs, userConfig }: Props) => {
  const { t } = useTranslation();
  const [schemaLoading, setSchemaLoading] = useState<Record<number, boolean>>({});

  const handleFetchSchema = useCallback(async (index: number) => {
    const config = customApiConfigs[index];
    if (!config.model) {
      toast.error('Please enter a model name first');
      return;
    }

    // Get Image Provider config for API key
    let providerRef = config.providerRefId ? userConfig.providerConfigs?.find((p: ProviderConfig) => p.id === config.providerRefId) : undefined;
    if (config.provider === CustomApiProvider.ImageAgent && config.agenticImageBotSettings?.imageGeneratorProviderId) {
      providerRef = userConfig.providerConfigs?.find((p: ProviderConfig) => p.id === config.agenticImageBotSettings?.imageGeneratorProviderId);
    }

    const apiKey = providerRef?.apiKey || config.apiKey || '';
    if (!apiKey) {
      toast.error('API key is required');
      return;
    }

    setSchemaLoading(prev => ({ ...prev, [index]: true }));

    try {
      const { schema, description } = await fetchReplicateModelSchema(apiKey, config.model);

      if (schema) {
        // Create enhanced description with model characteristics
        let enhancedDescription = `Generate images using ${config.model} model via Replicate.`;

        if (description) {
          // Clean up description - remove markdown, make it concise
          const cleanDescription = description
            .replace(/\*\*/g, '') // Remove markdown bold
            .replace(/\n/g, ' ') // Replace newlines with spaces
            .replace(/\s+/g, ' ') // Normalize spaces
            .trim();

          if (cleanDescription.length > 0 && cleanDescription.length < 200) {
            enhancedDescription += ` ${cleanDescription}`;
          }
        }

        const u = [...customApiConfigs];
        u[index].toolDefinition = {
          name: 'generate_image',
          description: enhancedDescription,
          input_schema: schema
        };
        updateCustomApiConfigs(u);
        toast.success('Schema fetched successfully');
      } else {
        toast.error('Schema not found for this model');
      }
    } catch (err) {
      console.error('Schema fetch error:', err);
      toast.error(`Failed to fetch schema: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSchemaLoading(prev => ({ ...prev, [index]: false }));
    }
  }, [customApiConfigs, updateCustomApiConfigs, userConfig]);

  return {
    schemaLoading,
    handleFetchSchema
  };
};