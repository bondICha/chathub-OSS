import Browser from 'webextension-polyfill'

import { ProviderConfig } from '~services/user-config';

export async function requestHostPermissions(
  customApiConfigs: any[],
  providerConfigs: ProviderConfig[],
): Promise<void> {
  try {
    const origins = new Set<string>();

    // Collect hosts from individual chatbot settings (only when using individual settings = no providerRefId)
    customApiConfigs.forEach(config => {
      try {
        if (config?.enabled && !config?.providerRefId && config?.host) {
          const raw = config.host.startsWith('http') ? config.host : `https://${config.host}`;
          const url = new URL(raw);
          origins.add(`${url.protocol}//${url.hostname}/`);
        }
      } catch (e) {
        console.warn('Invalid API host:', config?.host);
      }
    });

    // Collect hosts from provider configs
    providerConfigs.forEach(provider => {
      try {
        if (provider?.host) {
          const raw = provider.host.startsWith('http') ? provider.host : `https://${provider.host}`;
          const url = new URL(raw);
          origins.add(`${url.protocol}//${url.hostname}/`);
        }
      } catch (e) {
        console.warn('Invalid provider host:', provider?.host);
      }
    });

    const uniqueOrigins = Array.from(origins);

    if (uniqueOrigins.length > 0) {
      console.log('Requesting permissions for origins:', uniqueOrigins);
      await Browser.permissions.request({ origins: uniqueOrigins });
    }
  } catch (error) {
    console.error('Error requesting permissions:', error);
    // Don't throw error to prevent breaking the main operation
  }
}