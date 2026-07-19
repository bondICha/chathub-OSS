import { useInteractions, useListItem } from '@floating-ui/react'
import { cx } from '~/utils'
import { t } from 'i18next'
import { FC, createContext, useContext } from 'react'
import useSWR from 'swr'
import { Prompt, loadLocalPrompts } from '~services/prompts'

const LIBRARY_PROMPT: Prompt = {
  id: 'PROMPT_LIBRARY',
  title: t('Open Prompt Library'),
  prompt: '',
}

const BTW_PROMPT: Prompt = {
  id: 'BTW_COMMAND',
  title: '/btw — By The Way',
  prompt: '/btw ',
  description: t('BTW combobox description'),
}

export interface ComboboxContextValue {
  activeIndex: number | null
  getItemProps: ReturnType<typeof useInteractions>['getItemProps']
  handleSelect: (prompt: Prompt) => void
  setIsComboboxOpen: (open: boolean) => void
}

export const ComboboxContext = createContext<ComboboxContextValue>({} as ComboboxContextValue)

const PromptItem: FC<{ prompt: Prompt }> = ({ prompt }) => {
  const context = useContext(ComboboxContext)
  const { ref, index } = useListItem()
  const isActive = index === context.activeIndex
  return (
    <div
      ref={ref}
      tabIndex={isActive ? 0 : -1}
      className={cx(
        'cursor-default select-none py-2 px-4',
        isActive ? 'bg-primary-blue text-white' : 'text-primary-text hover:bg-secondary',
      )}
      {...context.getItemProps({
        onClick: () => {
          context.handleSelect(prompt)
        },
        onKeyDown: (e) => {
          if (e.keyCode === 13) {
            context.handleSelect(prompt)
            e.preventDefault()
          } else if (e.key === 'Backspace' || e.key === 'Delete') {
            context.setIsComboboxOpen(false)
          }
        },
      })}
    >
      <div className="font-medium text-sm">{prompt.title}</div>
      {prompt.description && (
        <div className={cx('text-xs mt-0.5', isActive ? 'text-white/75' : 'text-secondary-text')}>
          {prompt.description}
        </div>
      )}
    </div>
  )
}

const PromptCombobox: FC = () => {
  const promptsQuery = useSWR('user-prompts', loadLocalPrompts)
  if (!promptsQuery.data) {
    return null
  }

  return (
    <div className="overflow-auto rounded-md py-1 shadow-lg border border-primary-border text-sm min-w-[220px] bg-primary-background">
      <PromptItem key={BTW_PROMPT.id} prompt={BTW_PROMPT} />
      <div className="h-[1px] bg-primary-border" />
      {promptsQuery.data.map((prompt) => {
        return <PromptItem key={prompt.id} prompt={prompt} />
      })}
      {promptsQuery.data.length > 0 && <div className="h-[1px] bg-primary-border" />}
      <PromptItem key={LIBRARY_PROMPT.id} prompt={LIBRARY_PROMPT} />
    </div>
  )
}

export default PromptCombobox