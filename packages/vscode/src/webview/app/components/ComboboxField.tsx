import { Combobox, Transition } from '@headlessui/react'
import { ChevronUpDownIcon, CheckIcon } from '@heroicons/react/20/solid'
import { Fragment, useMemo, useState, useRef, FC, ReactNode } from 'react'
import { cx } from '~/utils'

export interface ComboboxOption {
  value: string
  label: string
  description?: string
  badge?: { text: string; color?: 'blue' | 'green' | 'orange' | 'gray' }
  group?: string
  icon?: ReactNode
  disabled?: boolean
}

interface Props {
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  emptyDisplayText?: string
  customLabel?: (query: string) => string
  type?: 'text' | 'password'
  className?: string
  disabled?: boolean
  searchable?: boolean
}

const badgeColorClass: Record<NonNullable<ComboboxOption['badge']>['color'] & string, string> = {
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  green: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  orange: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
}

const ComboboxField: FC<Props> = ({
  value,
  onChange,
  options,
  placeholder,
  emptyDisplayText,
  customLabel,
  type = 'text',
  className,
  disabled,
  searchable = true,
}) => {
  const [query, setQuery] = useState('')
  const skipNextChangeRef = useRef(false)

  const handleChange = (v: string) => {
    if (skipNextChangeRef.current) {
      skipNextChangeRef.current = false
      return
    }
    onChange(v ?? '')
    setQuery('')
  }

  const filteredOptions = useMemo(() => {
    if (!searchable || !query) return options
    const q = query.toLowerCase()
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.description?.toLowerCase().includes(q) ?? false),
    )
  }, [options, query, searchable])

  const grouped = useMemo(() => {
    const map = new Map<string, ComboboxOption[]>()
    for (const opt of filteredOptions) {
      const key = opt.group ?? ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(opt)
    }
    return map
  }, [filteredOptions])

  const matchedExact = useMemo(
    () => options.some((o) => o.value === query),
    [options, query],
  )

  const showCustomEntry = !!customLabel && query.length > 0 && !matchedExact

  const displayValue = (v: string) => {
    if (!v) return ''
    return v
  }

  const inputType = type === 'password' ? 'password' : 'text'

  return (
    <Combobox
      value={value}
      onChange={handleChange}
      disabled={disabled}
    >
      <div className={cx('relative', className)}>
        <div className="relative w-full cursor-default overflow-hidden rounded-md bg-white dark:bg-gray-700 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 focus-within:ring-2 focus-within:ring-blue-500 dark:focus-within:ring-blue-400 sm:text-sm">
          <Combobox.Input
            className="w-full border-none py-1.5 pl-3 pr-10 text-sm text-[#303030] dark:text-white bg-transparent outline-none placeholder:text-gray-400 dark:placeholder:text-gray-500"
            displayValue={displayValue}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={value ? undefined : (emptyDisplayText || placeholder)}
            type={inputType}
            autoComplete="off"
            spellCheck={false}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query && customLabel) {
                skipNextChangeRef.current = true
                onChange(query)
                setQuery('')
              }
            }}
            onBlur={() => {
              if (query && customLabel) {
                onChange(query)
                setQuery('')
              }
            }}
          />
          <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
            <ChevronUpDownIcon className="h-5 w-5 text-gray-400" aria-hidden="true" />
          </Combobox.Button>
        </div>
        <Transition
          as={Fragment}
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
          afterLeave={() => setQuery('')}
        >
          <Combobox.Options className="absolute z-50 mt-1 max-h-72 w-full min-w-[280px] overflow-auto rounded-md bg-white dark:bg-gray-800 py-1 text-sm shadow-lg ring-1 ring-black ring-opacity-5 dark:ring-gray-600 focus:outline-none">
            {showCustomEntry && (
              <Combobox.Option
                value={query}
                className={({ active }) =>
                  cx(
                    'relative cursor-pointer select-none py-2 pl-3 pr-9 border-b border-gray-200 dark:border-gray-700',
                    active ? 'bg-blue-100 text-blue-900 dark:bg-blue-600 dark:text-white' : 'text-gray-900 dark:text-gray-200',
                  )
                }
              >
                <span className="text-xs italic">{customLabel!(query)}</span>
              </Combobox.Option>
            )}

            {filteredOptions.length === 0 && !showCustomEntry && (
              <div className="px-3 py-2 text-gray-500 dark:text-gray-400 text-xs">
                {emptyDisplayText || 'No options'}
              </div>
            )}

            {[...grouped.entries()].map(([groupName, opts]) => (
              <Fragment key={groupName || '__default__'}>
                {groupName && (
                  <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    {groupName}
                  </div>
                )}
                {opts.map((opt) => (
                  <Combobox.Option
                    key={opt.value || `__${opt.label}`}
                    value={opt.value}
                    disabled={opt.disabled}
                    className={({ active }) =>
                      cx(
                        'relative cursor-pointer select-none py-2 pl-3 pr-9',
                        active ? 'bg-blue-100 text-blue-900 dark:bg-blue-600 dark:text-white' : 'text-gray-900 dark:text-gray-200',
                        opt.disabled && 'opacity-50 cursor-not-allowed',
                      )
                    }
                  >
                    {({ selected }) => (
                      <>
                        <div className="flex items-center gap-2">
                          {opt.icon}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={cx('truncate', selected && 'font-semibold')}>{opt.label}</span>
                              {opt.badge && (
                                <span className={cx('text-[10px] px-1.5 py-0.5 rounded-sm font-medium', badgeColorClass[opt.badge.color || 'gray'])}>
                                  {opt.badge.text}
                                </span>
                              )}
                            </div>
                            {opt.description && (
                              <div className="text-xs opacity-70 truncate font-mono">{opt.description}</div>
                            )}
                          </div>
                        </div>
                        {selected && (
                          <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-blue-600 dark:text-blue-300">
                            <CheckIcon className="h-4 w-4" aria-hidden="true" />
                          </span>
                        )}
                      </>
                    )}
                  </Combobox.Option>
                ))}
              </Fragment>
            ))}

          </Combobox.Options>
        </Transition>
      </div>
    </Combobox>
  )
}

export default ComboboxField
