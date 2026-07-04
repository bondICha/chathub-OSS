import { FC, useState, useRef, useEffect, Fragment } from 'react';
import { Transition } from '@headlessui/react';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/20/solid';
import { cx } from '~/utils';
import BotIcon from './BotIcon';

// インターフェースをエクスポート
export interface NestedDropdownOption {
  label: string;
  value?: string;
  children?: NestedDropdownOption[];
  disabled?: boolean;
  icon?: string;
}

interface Props {
  options: NestedDropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  showModelId?: boolean;
  onToggle?: (isOpen: boolean) => void;
  trigger?: React.ReactNode;
}

const NestedDropdown: FC<Props> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  showModelId = true,
  onToggle,
  trigger,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);

  // 現在選択されている値に対応するラベルを探す
  const findSelectedOption = (opts: NestedDropdownOption[]): NestedDropdownOption | null => {
    for (const option of opts) {
      if (option.value === value) {
        return option;
      }
      if (option.children) {
        const found = findSelectedOption(option.children);
        if (found) return found;
      }
    }
    return null;
  };

  const selectedOption = findSelectedOption(options);
  const selectedLabel = selectedOption ? selectedOption.label : placeholder;

  // 外部クリックでドロップダウンを閉じる
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        if (isOpen) {
          setIsOpen(false);
          onToggle?.(false);
        }
        setExpandedCategories(new Set());
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);


  // カテゴリの展開/収納をトグル
  const toggleCategory = (categoryIndex: number) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryIndex)) {
      newExpanded.delete(categoryIndex);
    } else {
      newExpanded.add(categoryIndex);
    }
    setExpandedCategories(newExpanded);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* トリガーボタン */}
      <div
        onClick={() => {
          const newIsOpen = !isOpen;
          setIsOpen(newIsOpen);
          onToggle?.(newIsOpen);
        }}
      >
        {trigger ? (
          trigger
        ) : (
          <button
            type="button"
            className="w-full flex items-center justify-between rounded-md bg-white dark:bg-gray-700 py-2 px-3 text-sm text-gray-900 dark:text-gray-200 shadow-sm ring-1 ring-inset ring-gray-300 dark:ring-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            <div className="flex items-center gap-2">
              {selectedOption && selectedOption.icon && <BotIcon iconName={selectedOption.icon} size={20} />}
              <span className="truncate">{selectedLabel}</span>
            </div>
            <ChevronDownIcon className="h-5 w-5 text-gray-400" />
          </button>
        )}
      </div>
      
      {/* ドロップダウンメニュー */}
      <Transition
        show={isOpen}
        as={Fragment}
        enter="transition ease-out duration-100"
        enterFrom="transform opacity-0 scale-95"
        enterTo="transform opacity-100 scale-100"
        leave="transition ease-in duration-75"
        leaveFrom="transform opacity-100 scale-100"
        leaveTo="transform opacity-0 scale-95"
      >
        <div className="absolute z-50 mt-1 w-full min-w-[280px] max-h-80 overflow-y-auto rounded-md bg-white dark:bg-gray-800 shadow-lg ring-1 ring-black dark:ring-gray-600 ring-opacity-5 focus:outline-none">
          <div className="py-1">
            {options.map((option, idx) => (
              <div key={idx}>
                {/* カテゴリヘッダー */}
                {option.children && option.children.length > 0 ? (
                  <>
                    <button
                      type="button"
                      className="w-full px-4 py-2 text-sm text-left font-medium text-gray-900 dark:text-gray-200 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 flex items-center justify-between"
                      onClick={() => toggleCategory(idx)}
                    >
                      <div className="flex items-center gap-2">
                        {option.icon && <BotIcon iconName={option.icon} size={18} />}
                        <span>{option.label}</span>
                      </div>
                      <ChevronRightIcon 
                        className={cx(
                          "h-4 w-4 transition-transform", 
                          expandedCategories.has(idx) && "rotate-90"
                        )} 
                      />
                    </button>
                    
                    {/* 展開されたモデル一覧 */}
                    {expandedCategories.has(idx) && (
                      <div className="bg-gray-25 dark:bg-gray-750">
                        {option.children.map((child, childIdx) => (
                          <button
                            key={childIdx}
                            type="button"
                            className={cx(
                              'w-full px-6 py-2 text-sm text-left text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600',
                              child.value === value && 'bg-blue-100 text-blue-900 dark:bg-blue-600 dark:text-white',
                              child.disabled && 'opacity-50 cursor-not-allowed'
                            )}
                            onClick={() => {
                              if (!child.disabled && child.value) {
                                onChange(child.value);
                                setIsOpen(false);
                                onToggle?.(false);
                                setExpandedCategories(new Set());
                              }
                            }}
                            disabled={child.disabled}
                          >
                            <div className="flex items-center gap-2">
                              {child.icon && <BotIcon iconName={child.icon} size={16} />}
                              <div className="flex-1">
                                <div className="font-medium">{child.label}</div>
                                {showModelId && child.value && (
                                  <div className="text-xs opacity-70">{child.value}</div>
                                )}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  // 子要素のないオプション（直接選択可能）
                  <button
                    type="button"
                    className={cx(
                      'w-full px-4 py-2 text-sm text-left text-gray-900 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700',
                      option.value === value && 'bg-blue-100 text-blue-900 dark:bg-blue-600 dark:text-white',
                      option.disabled && 'opacity-50 cursor-not-allowed'
                    )}
                    onClick={() => {
                      if (!option.disabled && option.value) {
                        onChange(option.value);
                        setIsOpen(false);
                        onToggle?.(false);
                        setExpandedCategories(new Set());
                      }
                    }}
                    disabled={option.disabled}
                  >
                    <div className="flex items-center gap-2">
                      {option.icon && <BotIcon iconName={option.icon} size={20} />}
                      <span>{option.label}</span>
                    </div>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </Transition>
    </div>
  );
};


export default NestedDropdown;
