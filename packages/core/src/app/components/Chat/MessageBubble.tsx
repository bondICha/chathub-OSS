import { cx } from '~/utils'
import { FC, PropsWithChildren, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Atom, Globe } from 'lucide-react'
import Expandable from '../common/Expandable'
import Markdown from '../Markdown'
import type { FetchedUrlContent, ReferenceUrl } from '~types/chat'

interface Props {
  color: 'primary' | 'flat'
  className?: string
  thinking?: string
  isUserMessage?: boolean
  searchResults?: any[];
  fetchedUrls?: FetchedUrlContent[];
  referenceUrls?: ReferenceUrl[];
}

const MessageBubble: FC<PropsWithChildren<Props>> = (props) => {
  const { t } = useTranslation();

  const fetchedContentTitle = (url: string) => {
    try {
      const urlObj = new URL(url);
      return `${t('Fetched Content')} (${urlObj.hostname})`;
    } catch {
      return `${t('Fetched Content')} (${url})`;
    }
  }

  const renderSearchResults = () => {
    if (!props.searchResults) return null;

    const groupedResults = props.searchResults.reduce((acc: Record<string, any[]>, result: any) => {
      const provider = result.provider || 'Unknown';
      if (!acc[provider]) {
        acc[provider] = [];
      }
      acc[provider].push(result);
      return acc;
    }, {});

    return Object.entries(groupedResults).map(([provider, results]) => (
      <div key={provider} className="mb-4">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{provider}</h4>
        <ul className="space-y-2 pl-4">
          {results.map((result: any, index: number) => (
            <li key={index}>
              <a href={result.link} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">{result.title}</a>
              {result.abstract && <p className="text-sm text-gray-500">{result.abstract}</p>}
            </li>
          ))}
        </ul>
      </div>
    ));
  };

  const renderFetchedUrls = () => {
    if (!props.fetchedUrls) return null;

    return props.fetchedUrls.map((fetchedUrl, index) => (
        <Expandable
          key={`${fetchedUrl.url}-${index}`}
          header={
            <>
              <Globe size={14} className="mr-1.5 text-text-secondary" />
              {fetchedContentTitle(fetchedUrl.url)}
            </>
          }
        >
          {fetchedUrl.content}
        </Expandable>
    ));
  };

  const renderReferenceUrls = () => {
    if (!props.referenceUrls || props.referenceUrls.length === 0) return null;

    return (
      <Expandable
        header={
          <>
            <Globe size={14} className="mr-1.5 text-text-secondary" />
            {t('Reference Sites')}
          </>
        }
        initiallyExpanded={false}
      >
        <ul className="space-y-1 pl-4">
          {props.referenceUrls.map((ref, index) => (
            <li key={`${ref.url}-${index}`}>
              <a
                href={ref.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                {ref.title || ref.url}
              </a>
            </li>
          ))}
        </ul>
      </Expandable>
    );
  };

  return (
    <div
      className={cx(
        'rounded-[15px] px-3 py-2 w-full',
        props.color === 'primary' ? 'bg-primary-blue text-white primary-message-bubble' : 'bg-secondary text-primary-text',
        props.className,
      )}
    >
      {props.thinking && (
          <Expandable
            header={
              <>
                <Atom size={14} className="mr-1.5 text-text-secondary" />
                {t('com_ui_thoughts')}
              </>
            }
            initiallyExpanded={false}
          >
            <Markdown>{props.thinking}</Markdown>
          </Expandable>
      )}
      {props.searchResults && props.searchResults.length > 0 && (
          <Expandable
            header={
              <>
                <Globe size={14} className="mr-1.5 text-text-secondary" />
                {t('Web Search Results')}
              </>
            }
          >
            {renderSearchResults()}
          </Expandable>
      )}
      {renderReferenceUrls()}
      {renderFetchedUrls()}
      {props.children}
    </div>
  )
}

export default MessageBubble