import { useState, memo, useCallback, useMemo } from 'react';
import { Atom, ChevronDown } from 'lucide-react';
import type { MouseEvent, FC } from 'react';
import { useTranslation } from 'react-i18next';
import type { SearchResultItem } from '~services/agent/web-search/base';

const BUTTON_STYLES = {
  base: 'group flex w-fit items-center justify-center rounded-xl bg-surface-tertiary px-3 py-2 text-xs leading-[18px] animate-thinking-appear',
  icon: 'icon-sm ml-1.5 transform-gpu text-text-primary transition-transform duration-200',
} as const;

const CONTENT_STYLES = {
  wrapper: 'relative pl-3 text-text-secondary',
  border:
    'absolute left-0 h-[calc(100%-10px)] border-l-2 border-border-medium dark:border-border-heavy',
  partBorder:
    'absolute left-0 h-[calc(100%)] border-l-2 border-border-medium dark:border-border-heavy',
  text: 'whitespace-pre-wrap leading-[26px]',
} as const;

export const ThinkingContent: FC<{ children: React.ReactNode; isPart?: boolean }> = memo(
  ({ isPart, children }) => (
      <div className={CONTENT_STYLES.wrapper}>
        <div className={isPart === true ? CONTENT_STYLES.partBorder : CONTENT_STYLES.border} />
      <div className={CONTENT_STYLES.text}>{children}</div>
      </div>
  ),
);

export const ThinkingButton = memo(
  ({
    isExpanded,
    onClick,
    label,
  }: {
    isExpanded: boolean;
    onClick: (e: MouseEvent<HTMLButtonElement>) => void;
    label: string;
  }) => (
    <button type="button" onClick={onClick} className={BUTTON_STYLES.base}>
      <Atom size={14} className="mr-1.5 text-text-secondary" />
      {label}
      <ChevronDown className={`${BUTTON_STYLES.icon} ${isExpanded ? 'rotate-180' : ''}`} />
    </button>
  ),
);

const Thinking: React.ElementType = memo(({ children, searchResults }: { children: React.ReactNode, searchResults?: SearchResultItem[] }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(true);

  const handleClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsExpanded((prev: boolean) => !prev);
  }, []);

  if (children == null && !searchResults?.length) {
    return null;
  }

  const label = useMemo(() => {
    if (typeof children === 'string' && children.trim().length > 0) {
      const lines = children.trim().split('\n');
      if (lines.length > 0 && lines[0].trim().length > 0) {
        return lines[0].trim();
      }
    }
    if (searchResults?.length) {
      return t('Searching the web...');
    }
    return t('Thinking...');
  }, [children, searchResults, t]);

  return (
    <>
      <div className="mb-3">
        <ThinkingButton isExpanded={isExpanded} onClick={handleClick} label={label} />
      </div>
      <div
        className="transition-all duration-300 ease-out"
        style={{
          maxHeight: isExpanded ? '45vh' : '0',
          marginBottom: isExpanded ? '2rem' : '0',
          overflowY: isExpanded ? 'auto' : 'hidden',
          overflowX: 'hidden',
        }}
      >
        {children && (
          <ThinkingContent isPart={!searchResults?.length}>
            {children}
          </ThinkingContent>
        )}
        {searchResults && (
          <ThinkingContent isPart={true}>
            {(() => {
              // Group results by provider
              const groupedResults = searchResults.reduce((acc, result) => {
                const provider = result.provider || 'Unknown';
                if (!acc[provider]) {
                  acc[provider] = [];
                }
                acc[provider].push(result);
                return acc;
              }, {} as Record<string, typeof searchResults>);

              return Object.entries(groupedResults).map(([provider, results]) => (
                <div key={provider} className="mb-4">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{provider}</h4>
                  <ul className="space-y-2 pl-4">
                    {results.map((result, index) => (
                      <li key={index}>
                        <a href={result.link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{result.title}</a>
                        {result.abstract && <p className="text-sm text-gray-500">{result.abstract}</p>}
                      </li>
                    ))}
                  </ul>
                </div>
              ));
            })()}
          </ThinkingContent>
        )}
      </div>
    </>
  );
});

ThinkingButton.displayName = 'ThinkingButton';
ThinkingContent.displayName = 'ThinkingContent';
Thinking.displayName = 'Thinking';

export default memo(Thinking);
