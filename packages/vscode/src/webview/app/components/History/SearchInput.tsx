import { FC, memo } from 'react'
import { useTranslation } from 'react-i18next'
import { FiSearch } from 'react-icons/fi'
import { cx } from '~utils'

const SearchInput: FC<{ value: string; onChange: (v: string) => void }> = memo((props) => {
  const { t } = useTranslation()
  return (
    <div className="rounded-xl bg-secondary h-9 flex flex-row items-center px-4 grow">
      <FiSearch size={18} className="mr-[6px] opacity-30" />
      <input
        className={cx('bg-transparent w-full outline-none text-sm')}
        placeholder={t('Full-text search for chat history') as string}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  )
})
SearchInput.displayName = 'SearchInput'

export default SearchInput
