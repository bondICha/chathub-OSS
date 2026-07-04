import { FC, useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import Browser from 'webextension-polyfill'
import { getUserConfig } from '~services/user-config'
import Button from '../Button'
import Toggle from '../Toggle'

const AllHostsPermissionPanel: FC = () => {
  const { t } = useTranslation()
  const [hasPermission, setHasPermission] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const checkPermission = useCallback(async () => {
    try {
      const allHostsPermissions = {
        origins: ['https://*/*', 'http://*/*']
      }
      const hasPermissions = await Browser.permissions.contains(allHostsPermissions)
      setHasPermission(hasPermissions)
    } catch (error) {
      console.error('Error checking permissions:', error)
    }
  }, [])

  useEffect(() => {
    checkPermission()
  }, [checkPermission])

  const handlePermissionToggle = useCallback(async (enabled: boolean) => {
    setIsLoading(true)
    try {
      const allHostsPermissions = {
        origins: ['https://*/*', 'http://*/*']
      }

      if (enabled) {
        const granted = await Browser.permissions.request(allHostsPermissions)
        if (granted) {
          setHasPermission(true)
        }
      } else {
        // Remove all-hosts permission and then re-grant enabled chatbot permissions
        await Browser.permissions.remove(allHostsPermissions)
        
        // Get user config to find enabled chatbots
        const config = await getUserConfig()
        const origins = new Set<string>();

        if (config.customApiConfigs) {
          config.customApiConfigs.forEach(botConfig => {
            // 個別設定の場合（providerRefId 未設定）かつ host がある場合に権限再付与対象とする
            if (botConfig.enabled && !botConfig.providerRefId && botConfig.host) {
              try {
                const url = new URL(botConfig.host.startsWith('http') ? botConfig.host : `https://${botConfig.host}`);
                origins.add(`${url.protocol}//${url.hostname}/`);
              } catch (error) {
                console.warn('Invalid API host:', botConfig.host);
              }
            }
          });
        }

        if (config.providerConfigs) {
          config.providerConfigs.forEach(provider => {
            if (provider.host) {
              try {
                const url = new URL(provider.host.startsWith('http') ? provider.host : `https://${provider.host}`);
                origins.add(`${url.protocol}//${url.hostname}/`);
              } catch (error) {
                console.warn('Invalid provider host:', provider.host);
              }
            }
          });
        }
        
        const enabledBotHosts = Array.from(origins);
        
        // Re-grant permissions for enabled chatbots
        if (enabledBotHosts.length > 0) {
          try {
            await Browser.permissions.request({ origins: enabledBotHosts })
          } catch (error) {
            console.warn('Failed to re-grant chatbot permissions:', error)
          }
        }
        
        setHasPermission(false)
      }
    } catch (error) {
      console.error('Error handling permission:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <p className="font-semibold text-sm">{t('Allow access to all websites')}</p>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {t('Grant permission to access all websites for web search and content fetching. This eliminates individual permission prompts.')}
          </p>
        </div>
        <Toggle
          enabled={hasPermission}
          onChange={isLoading ? undefined : handlePermissionToggle}
        />
      </div>
      
      {!hasPermission && (
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {t('Individual site permissions will be requested as needed when disabled.')}
        </div>
      )}
    </div>
  )
}

export default AllHostsPermissionPanel