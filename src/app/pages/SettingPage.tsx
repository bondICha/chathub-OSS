import { motion } from 'framer-motion'
import { FC, PropsWithChildren, useCallback, useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { BiChevronLeft, BiChevronRight } from 'react-icons/bi'
import Browser from 'webextension-polyfill'
import Button from '~app/components/Button'
import { Input } from '~app/components/Input'
import RadioGroup from '~app/components/RadioGroup'
import Select from '~app/components/Select'
import Tooltip from '~app/components/Tooltip'
import Blockquote from '~app/components/Settings/Blockquote'
import { BiInfoCircle } from 'react-icons/bi'
import { cloneDeep } from 'lodash-es'
import { requestHostPermissions } from '~services/host-permissions'
import { useAtomValue } from 'jotai'
import { themeColorAtom } from '~app/state'


import CustomAPISettings from '~app/components/Settings/CustomApiSettings'
import ExportDataPanel from '~app/components/Settings/ExportDataPanel'
import ShortcutPanel from '~app/components/Settings/ShortcutPanel'
import AllHostsPermissionPanel from '~app/components/Settings/AllHostsPermissionPanel'
import DangerZone from '~app/components/Settings/DangerZone'
import Switch from '~app/components/Switch'
import SettingPageSideMenu from './SettingPageSideMenu'

import { ALL_IN_ONE_PAGE_ID } from '~app/consts'
import {
  UserConfig,
  getUserConfig,
  updateUserConfig,
  CustomApiConfig,
  getSavedChatPairs,
  ChatPair,
} from '~services/user-config'
import { getVersion } from '~utils'
import PagePanel from '../components/Page'
import { getCompanyProfileConfigs, getCompanyProfileState, CompanyProfileStatus } from '~services/company-profile'
import OldStorageNotification from '~app/components/Settings/OldStorageNotification'
import SettingsChatFloat from '~app/components/Settings/SettingsChatFloat'


const ChatBotSettingPanel: FC<PropsWithChildren<{ title: string }>> = (props) => {
  return (
    <div className="p-3 min-w-[600px] flex-1 max-w-[800px] border border-gray-500 shadow-md rounded-lg hover:shadow-lg transition-shadow">
      <p className="font-bold text-md">{props.title}</p>
      {props.children}
    </div>
  )
}

function SettingPage() {
  const { t } = useTranslation()
  const [userConfig, setUserConfig] = useState<UserConfig | undefined>(undefined)
  const [dirty, setDirty] = useState(false)
  const [companyInfo, setCompanyInfo] = useState<{ name: string; version: string } | null>(null)
  const [savedPairs, setSavedPairs] = useState<ChatPair[]>([])
  const [activeSection, setActiveSection] = useState('section-startup')
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true
    return window.innerWidth >= 1024
  })
  const themeColor = useAtomValue(themeColorAtom)
  const scrollContainerRef = useRef<HTMLDivElement>(null)


  useEffect(() => {
    getUserConfig().then((config) => {
      setUserConfig(config);
    });
    getSavedChatPairs().then(setSavedPairs).catch(() => {});

    // Check for active company profile from stored state
    const checkActiveCompanyProfile = async () => {
      try {
        const configs = await getCompanyProfileConfigs();
        for (const profile of configs) {
          const state = await getCompanyProfileState(profile.companyName);
          if (state && state.status === CompanyProfileStatus.IMPORTED) {
            setCompanyInfo({ name: profile.companyName, version: profile.version });
            return;
          }
        }
        setCompanyInfo(null);
      } catch (error) {
        console.error('Failed to check company profile:', error);
        setCompanyInfo(null);
      }
    };

    checkActiveCompanyProfile();
  }, [])

  const updateConfigValue = useCallback(
    (update: Partial<UserConfig>) => {
      setUserConfig(prevConfig => {
        if (prevConfig) {
          return { ...prevConfig, ...update }
        }
        return prevConfig
      })
      setDirty(true)
    },
    [],
  )

  const save = useCallback(async () => {
    if (!userConfig) {
      toast.error(t('Failed to get current settings. Please try again.'));
      return;
    }

    try {
      await requestHostPermissions(userConfig.customApiConfigs || [], userConfig.providerConfigs || []);
      await updateUserConfig(cloneDeep(userConfig));
      setDirty(false);
      toast.success(t('Settings saved. API changes require reload'));
    } catch (error) {
      console.error('Failed to save settings:', error);
      toast.error(t('Failed to save settings. Please try again.'));
    }
  }, [userConfig, t]);

  const handleConfigReset = useCallback(() => {
    window.location.reload();
  }, []);

  const isProgrammaticScrollRef = useRef(false)
  const programmaticScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scrollToSection = useCallback((sectionId: string) => {
    setActiveSection(sectionId)
    const container = scrollContainerRef.current
    const target = document.getElementById(sectionId)
    if (!target || !container) return
    const targetTop = target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop - 12
    isProgrammaticScrollRef.current = true
    if (programmaticScrollTimeoutRef.current) clearTimeout(programmaticScrollTimeoutRef.current)
    programmaticScrollTimeoutRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false
    }, 1500)
    container.scrollTo({ top: targetTop, behavior: 'smooth' })
  }, [])

  // Track active section based on scroll position using IntersectionObserver
  useEffect(() => {
    if (!userConfig) return
    const container = scrollContainerRef.current
    if (!container) return

    const sectionIds = [
      'section-export',
      'section-startup',
      'section-title-generation',
      'section-common',
      'section-relationships',
      'section-providers',
      ...((userConfig.providerConfigs || []).map((_, i) => `provider-setting-${i}`)),
      'section-chatbots',
      ...((userConfig.customApiConfigs || []).map((_, i) => `chatbot-setting-${i}`)),
      'section-shortcuts',
      'section-danger',
    ]

    const targets = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => !!el)

    if (targets.length === 0) return

    const visibility = new Map<string, number>()

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          visibility.set(entry.target.id, entry.intersectionRatio)
        })
        if (isProgrammaticScrollRef.current) return
        let topMostId: string | null = null
        let topMostTop = -Infinity
        const containerTop = container.getBoundingClientRect().top
        targets.forEach((el) => {
          const ratio = visibility.get(el.id) ?? 0
          if (ratio <= 0) return
          const top = el.getBoundingClientRect().top - containerTop
          if (top > container.clientHeight * 0.4) return
          if (top > topMostTop) {
            topMostTop = top
            topMostId = el.id
          }
        })
        if (topMostId) setActiveSection(topMostId)
      },
      {
        root: container,
        rootMargin: '0px 0px -60% 0px',
        threshold: [0, 0.1, 0.5, 1],
      },
    )

    targets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [userConfig])

  if (!userConfig) {
    return null
  }

  const customApiConfigs = userConfig.customApiConfigs || []

  return (
    <div className="flex flex-col overflow-hidden bg-primary-background dark:text-primary-text rounded-2xl h-full">
      <SettingsChatFloat userConfig={userConfig} onUpdateConfig={updateConfigValue} />
      <div className="text-center border-b border-solid border-primary-border flex flex-col justify-center mx-10 py-2 flex-shrink-0">
        <span className="font-semibold text-lg">{t('Settings')} (v{getVersion()})</span>
      </div>
      <div className="flex flex-row flex-1 overflow-hidden relative">
        {/* Sidebar */}
        {sidebarOpen && (
          <div className="w-48 flex-shrink-0 border-r border-primary-border overflow-y-auto custom-scrollbar">
            <SettingPageSideMenu
              activeSection={activeSection}
              onSectionClick={scrollToSection}
              customApiConfigs={customApiConfigs}
              providerConfigs={userConfig.providerConfigs || []}
            />
          </div>
        )}

        {/* Sidebar toggle button */}
        <button
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={t('Toggle sidebar')}
          title={t('Toggle sidebar')}
          className="absolute top-2 z-10 w-6 h-6 flex items-center justify-center rounded-full bg-primary-background border border-primary-border shadow-sm hover:bg-primary-border transition-colors"
          style={{ left: sidebarOpen ? 'calc(12rem - 12px)' : '4px' }}
        >
          {sidebarOpen ? <BiChevronLeft size={16} /> : <BiChevronRight size={16} />}
        </button>

        {/* Main content */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto custom-scrollbar">
          {companyInfo && (
            <div className="mx-10 mt-3">
              {t('Company Profile Active')}: {companyInfo.name} (v{companyInfo.version})
            </div>
          )}
          <OldStorageNotification />
          <div className="flex flex-col gap-5 mt-3 mb-10 px-6" style={{ backgroundColor: themeColor ? `${themeColor}15` : 'rgba(17, 24, 39, 0.15)' }}>

            <div id="section-export" className="scroll-mt-3">
              <ExportDataPanel userConfig={userConfig} updateConfigValue={updateConfigValue} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-5">
              <div id="section-startup" className="scroll-mt-3">
                <p className="font-bold mb-2 text-lg">{t('Startup page')}</p>
                <div className="w-full max-w-[320px]">
                  <Select
                    showIcon={true}
                    options={[
                      { name: 'All-In-One', value: ALL_IN_ONE_PAGE_ID, icon: 'BsGrid3X3' },
                      ...(savedPairs.length > 0 ? [
                        { name: t('Saved Pairs'), value: '__label_pairs__' as string, isLabel: true },
                        ...savedPairs.map((pair: ChatPair) => ({
                          name: pair.name,
                          value: pair.id,
                          icon: 'BsBookmarkStar',
                        })),
                      ] : []),
                      { name: t('Individual Bots'), value: '__label_bots__' as string, isLabel: true },
                      ...(userConfig.customApiConfigs || []).map((config: CustomApiConfig, index: number) => ({
                        name: config.name,
                        value: `custom-${index}`,
                        icon: config.avatar,
                      })),
                    ]}
                    value={userConfig.startupPage}
                    onChange={(v) => updateConfigValue({ startupPage: v as string })}
                  />
                </div>
              </div>
              <div id="section-title-generation" className="scroll-mt-3">
                <p className="font-bold mb-2 text-lg flex items-center gap-1.5">
                  {t('AI Title Generation')}
                  <Tooltip content={t('AI Title Generation Prompt Description')}>
                    <BiInfoCircle className="w-4 h-4 opacity-60 cursor-help" />
                  </Tooltip>
                </p>
                <div className="w-full max-w-[320px]">
                  <Select
                    showIcon={true}
                    options={[
                      { name: t('Do not generate title'), value: '' },
                      ...(userConfig.customApiConfigs || []).map((config: CustomApiConfig, index: number) => ({
                        name: config.name,
                        value: index.toString(),
                        icon: config.avatar,
                      })),
                    ]}
                    value={userConfig.titleGenerationBotIndex !== undefined ? userConfig.titleGenerationBotIndex.toString() : ''}
                    onChange={(v) => updateConfigValue({ titleGenerationBotIndex: v === '' ? undefined : parseInt(v, 10) })}
                  />
                </div>
                {userConfig.titleGenerationBotIndex !== undefined && (
                  <div className="flex items-center gap-2 mt-2">
                    <Switch
                      checked={userConfig.titleUpdateEveryTurn || false}
                      onChange={(v) => updateConfigValue({ titleUpdateEveryTurn: v })}
                    />
                    <span className="text-sm text-primary-text">{t('Update title every turn')}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4 w-full">
              <CustomAPISettings userConfig={userConfig} updateConfigValue={updateConfigValue} />
            </div>

            <div id="section-shortcuts" className="scroll-mt-3">
              <ShortcutPanel />
            </div>

            <div id="section-danger" className="scroll-mt-3">
              <DangerZone onConfigReset={handleConfigReset} />
            </div>
          </div>
          {dirty && (
            <motion.div
              className="sticky bottom-0 w-full bg-primary-background border-t-2 border-primary-border px-5 py-4 drop-shadow flex flex-row items-center justify-center"
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              transition={{ type: 'tween', ease: 'easeInOut' }}
            >
              <Button color="primary" size="small" text={t('Save changes')} onClick={save} className="py-2" />
            </motion.div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SettingPage
