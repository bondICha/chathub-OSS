
import { useState, memo, useCallback } from 'react';
import { ChevronDown } from 'lucide-react';
import type { MouseEvent, FC, ReactNode } from 'react';
import { cx } from '~/utils';

interface ExpandableProps {
  header: ReactNode;
  children: ReactNode;
  initiallyExpanded?: boolean;
}

const Expandable: FC<ExpandableProps> = memo(({ header, children, initiallyExpanded = true }) => {
  const [isExpanded, setIsExpanded] = useState(initiallyExpanded);

  const toggleExpand = useCallback((e: MouseEvent<HTMLElement>) => {
    e.preventDefault();
    setIsExpanded((prev) => !prev);
  }, []);

  if (children == null) {
    return null;
  }

  return (
    <div className="my-2">
      <div onClick={toggleExpand} className="cursor-pointer flex items-center group flex w-fit items-center justify-center rounded-xl bg-surface-tertiary px-3 py-2 text-xs leading-[18px] animate-thinking-appear">
        {header}
        <ChevronDown className={cx('icon-sm ml-1.5 transform-gpu transition-transform duration-200', isExpanded && 'rotate-180')} />
      </div>
      <div
        className={cx('grid transition-all duration-300 ease-out', isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
      >
        <div className="overflow-auto" style={{ maxHeight: '45vh' }}>
            <div className="relative pl-3 text-text-secondary mt-2">
                <div className="absolute left-0 top-0 h-full border-l-2 border-border-medium dark:border-border-heavy" />
                {children}
            </div>
        </div>
      </div>
    </div>
  );
});

Expandable.displayName = 'Expandable';
export default Expandable;
