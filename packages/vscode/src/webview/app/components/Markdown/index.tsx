/* eslint-disable react/prop-types */

import { cx } from '~/utils'
import { FC, ReactNode, useEffect, memo, useMemo, useRef, useState } from 'react'
import { CopyToClipboard } from 'react-copy-to-clipboard-ts'
import { BsClipboard } from 'react-icons/bs'
import ReactMarkdown from 'react-markdown'
import reactNodeToString from 'react-node-to-string'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import supersub from 'remark-supersub'
import remarkDirective from 'remark-directive';
import rehypeExternalLinks from 'rehype-external-links'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import Tooltip from '../Tooltip'
import 'github-markdown-css/github-markdown-dark.css'
import './markdown.css'
import type { Pluggable } from 'unified';
import {
  CodeBlockProvider,
  useCodeBlockContext
} from './CodeBlockContext';
import CodeBlock from './Content/CodeBlock'
import MermaidDiagram from './Content/MermaidDiagram'


function CustomCode(props: { children: ReactNode; className?: string }) {
  const [copied, setCopied] = useState(false)

  const code = useMemo(() => reactNodeToString(props.children), [props.children])

  useEffect(() => {
    if (copied) {
      setTimeout(() => setCopied(false), 1000)
    }
  }, [copied])

  return (
    <div className="flex flex-col">
      <div className="bg-[#e6e7e8] dark:bg-[#444a5354] text-xs p-2">
        <CopyToClipboard text={code} onCopy={() => setCopied(true)}>
          <div className="flex flex-row items-center gap-2 cursor-pointer w-fit ml-1">
            <BsClipboard />
            <span>{copied ? 'copied' : 'copy code'}</span>
          </div>
        </CopyToClipboard>
      </div>
      <code className={cx(props.className, 'px-4')}>{props.children}</code>
    </div>
  )
}

export const handleDoubleClick: React.MouseEventHandler<HTMLElement> = (event) => {
  const range = document.createRange();
  range.selectNodeContents(event.target as Node);
  const selection = window.getSelection();
  if (!selection) {
    return;
  }
  selection.removeAllRanges();
  selection.addRange(range);
};

type HastNode = {
  type: string;
  value?: string;
  children?: HastNode[];
};

type TCodeProps = {
  inline?: boolean;
  className?: string;
  children: React.ReactNode;
  node?: HastNode;
};

// hAST のテキストノードを再帰的に連結して生テキストを得る
// rehype-highlight が code 内に span を挿入した場合でも改行を保持できる
function hastToText(nodes?: HastNode[]): string {
  if (!nodes) return '';
  return nodes
    .map((n) => (n.type === 'text' ? n.value ?? '' : hastToText(n.children)))
    .join('');
}

export const code: React.ElementType = memo(({ className, children, node }: TCodeProps) => {
  const match = /language-(\w+)/.exec(className ?? '');
  const lang = match && match[1];
  const isMath = lang === 'math';
  const isMermaid = lang === 'mermaid';
  const isSingleLine = typeof children === 'string' && children.split('\n').length === 1;

  const { getNextIndex, resetCounter } = useCodeBlockContext();
  const blockIndex = useRef(getNextIndex(isMath || isMermaid || isSingleLine)).current;

  useEffect(() => {
    resetCounter();
  }, [children, resetCounter]);

  if (isMath) {
    return <>{children}</>;
  } else if (isMermaid) {
    const rawFromHast = hastToText(node?.children);
    const codeString = rawFromHast.length > 0
      ? rawFromHast.replace(/\n$/, '')
      : (typeof children === 'string' ? children : reactNodeToString(children));
    return <MermaidDiagram code={codeString} />;
  } else if (isSingleLine) {
    return (
      <code onDoubleClick={handleDoubleClick} className={className}>
        {children}
      </code>
    );
  } else {
    const codeString = typeof children === 'string' 
      ? children 
      : reactNodeToString(children);
    
    return <CodeBlock language={lang ?? ''} code={codeString} />;
  }
});

// Convert LaTeX-style delimiters \(...\) and \[...\] to remark-math compatible $...$ and $$...$$
function normalizeLatexDelimiters(text: string): string {
  // \[...\] → $$...$$  (display math, must come before inline to avoid conflict)
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner}$$`)
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner}$`);
}

const Markdown: FC<{ children: string; allowHtml?: boolean }> = ({ children, allowHtml = false }) => {
  const normalizedChildren = useMemo(() => normalizeLatexDelimiters(children), [children]);

  const remarkPlugins: Pluggable[] = useMemo(
    () => [
      supersub,
      remarkGfm,
      remarkDirective,
      [remarkMath, { singleDollarTextMath: true }],
    ],
    [],
  );
  return (
    <CodeBlockProvider>
    <div className={`markdown-body markdown-custom-styles code-block-no-margin !text-base font-normal`}>
    <ReactMarkdown
      /** @ts-ignore */
      remarkPlugins={
        // [[remarkMath, { singleDollarTextMath: true }],remarkBreaks, remarkGfm]

        remarkPlugins
      }
      rehypePlugins={allowHtml
        ? [
            rehypeRaw,
            rehypeKatex,
            [rehypeHighlight, { detect: false, ignoreMissing: true }],
            [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }]
          ]
        : [
            rehypeKatex,
            [rehypeHighlight, { detect: false, ignoreMissing: true }],
            [rehypeExternalLinks, { target: '_blank', rel: ['noopener', 'noreferrer'] }]
          ]
      }
      {...({ urlTransform: (url: string) => url } as any)}
      // linkTarget="_blank" // Deprecated at markdown 9.0.0
      components={{
        a: ({ node, ...props }) => {
          if (!props.title) {
            return <a {...props} />
          }
          return (
            <Tooltip content={props.title}>
              <a {...props} title={undefined} />
            </Tooltip>
          )
        },
        img: ({ node, ...props }) => {
          const src = (props as any).src as string | undefined
          if (!src) return <img {...(props as any)} />
          if (src.startsWith('data:')) {
            return <img {...(props as any)} />
          }
          return (
            <a href={src} target="_blank" rel="noopener noreferrer">
              <img {...(props as any)} />
            </a>
          )
        },
        code,
        table: ({ node, ...props }) => (
          <div className="table-wrapper">
            <table {...props} />
          </div>
        ),
      }}
    >
      {normalizedChildren}
    </ReactMarkdown>
    </div>
    </CodeBlockProvider>
  )
}

export default Markdown
