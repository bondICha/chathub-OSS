import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { cx } from '~/utils'
import { CustomApiConfig, ProviderConfig } from '~services/user-config'
import BotIcon from '~app/components/BotIcon'

interface SettingPageSideMenuProps {
  activeSection: string
  onSectionClick: (sectionId: string) => void
  customApiConfigs: CustomApiConfig[]
  providerConfigs: ProviderConfig[]
}

interface SideMenuItemProps {
  id: string
  label: string
  active: boolean
  onClick: () => void
  icon?: React.ReactNode
  indentLevel?: 0 | 1 | 2
}

const SideMenuItem: FC<SideMenuItemProps> = ({ label, active, onClick, icon, indentLevel = 0 }) => (
  <button
    onClick={onClick}
    className={cx(
      'w-full text-left flex items-center gap-2 pr-3 py-1.5 rounded-lg text-sm transition-colors',
      indentLevel === 0 && 'pl-3',
      indentLevel === 1 && 'pl-5',
      indentLevel === 2 && 'pl-8',
      active
        ? 'bg-primary/15 text-primary font-medium'
        : 'text-secondary-text hover:bg-primary-border hover:text-primary-text',
    )}
  >
    {icon && <span className="flex-shrink-0">{icon}</span>}
    <span className="truncate">{label}</span>
  </button>
)

const SettingPageSideMenu: FC<SettingPageSideMenuProps> = ({ activeSection, onSectionClick, customApiConfigs, providerConfigs }) => {
  const { t } = useTranslation()

  // Order matches the actual page DOM order — single source of truth for navigation
  const items: Array<
    | { kind: 'item'; id: string; label: string; indentLevel?: 0 | 1 | 2; icon?: React.ReactNode }
    | { kind: 'header'; label: string }
    | { kind: 'spacer' }
  > = [
    { kind: 'item', id: 'section-export', label: t('Export/Import Data') },
    { kind: 'item', id: 'section-startup', label: t('Startup page') },
    { kind: 'item', id: 'section-title-generation', label: t('AI Title Generation') },
    { kind: 'header', label: t('Chatbots configuration') },
    { kind: 'item', id: 'section-common', label: t('Common Settings'), indentLevel: 1 },
    { kind: 'item', id: 'section-relationships', label: t('Provider–Chatbot Relationships'), indentLevel: 1 },
    { kind: 'item', id: 'section-providers', label: t('API Providers'), indentLevel: 1 },
    ...providerConfigs.map((prov, index) => ({
      kind: 'item' as const,
      id: `provider-setting-${index}`,
      label: prov.name || `Provider ${index + 1}`,
      indentLevel: 2 as const,
      icon: <BotIcon iconName={prov.icon || 'OpenAI.Black'} size={14} className="flex-shrink-0" />,
    })),
    { kind: 'item', id: 'section-chatbots', label: t('Chatbots'), indentLevel: 1 },
    ...customApiConfigs.map((config, index) => ({
      kind: 'item' as const,
      id: `chatbot-setting-${index}`,
      label: config.name || `Bot ${index + 1}`,
      indentLevel: 2 as const,
      icon: <BotIcon iconName={config.avatar || 'OpenAI.Black'} size={14} className="flex-shrink-0" />,
    })),
    { kind: 'spacer' },
    { kind: 'item', id: 'section-shortcuts', label: t('Shortcuts') },
    { kind: 'item', id: 'section-danger', label: t('Danger Zone') },
  ]

  return (
    <nav className="flex flex-col gap-1 py-4 px-2">
      {items.map((it, idx) => {
        if (it.kind === 'header') {
          return (
            <div key={`h-${idx}`} className="mt-2 mb-1 px-3 text-xs font-semibold text-secondary-text uppercase tracking-wider">
              {it.label}
            </div>
          )
        }
        if (it.kind === 'spacer') {
          return <div key={`s-${idx}`} className="mt-2" />
        }
        return (
          <SideMenuItem
            key={it.id}
            id={it.id}
            label={it.label}
            active={activeSection === it.id}
            onClick={() => onSectionClick(it.id)}
            icon={it.icon}
            indentLevel={it.indentLevel}
          />
        )
      })}
    </nav>
  )
}

export default SettingPageSideMenu
