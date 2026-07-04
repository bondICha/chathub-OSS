import { useState, useMemo, memo, useCallback } from 'react';
import { Globe, ChevronDown } from 'lucide-react';
import type { MouseEvent, FC } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '~/utils';

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

export const FetchedContentDisplay: FC<{ children: React.ReactNode; isPart?: boolean }> = memo(
  ({ isPart, children }) => (
      <div className={CONTENT_STYLES.wrapper}>
        <div className={isPart === true ? CONTENT_STYLES.partBorder : CONTENT_STYLES.border} />
      <p className={CONTENT_STYLES.text}>{children}</p>
      </div>
  ),
);

export const FetchedContentButton = memo(
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
      <Globe size={14} className="mr-1.5 text-text-secondary" />
      {label}
      <ChevronDown className={`${BUTTON_STYLES.icon} ${isExpanded ? 'rotate-180' : ''}`} />
    </button>
  ),
);

const FetchedContentThinking: React.ElementType = memo(({ children, url }: { children: React.ReactNode; url?: string }) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  const handleClick = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setIsExpanded((prev: boolean) => !prev);
  }, []);

  const label = useMemo(() => {
    if (url) {
      try {
        const urlObj = new URL(url);
        return `Fetched Content (${urlObj.hostname})`;
      } catch {
        return `Fetched Content (${url})`;
      }
    }
    return t('Fetched Content');
  }, [t, url]);

  if (children == null) {
    return null;
  }

  return (
    <>
      <div className="mb-3">
        <FetchedContentButton isExpanded={isExpanded} onClick={handleClick} label={label} />
      </div>
      <div
        className={cx('grid transition-all duration-300 ease-out', isExpanded && 'mb-8')}
        style={{
          gridTemplateRows: isExpanded ? '1fr' : '0fr',
        }}
      >
        <div 
          className="overflow-auto" 
          style={{
            maxHeight: isExpanded ? '45vh' : 'auto',
          }}
        >
          <FetchedContentDisplay isPart={true}>{children}</FetchedContentDisplay>
        </div>
      </div>
    </>
  );
});

FetchedContentButton.displayName = 'FetchedContentButton';
FetchedContentDisplay.displayName = 'FetchedContentDisplay';
FetchedContentThinking.displayName = 'FetchedContentThinking';

export default memo(FetchedContentThinking);