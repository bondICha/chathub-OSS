import React, { useState } from 'react';
import { Prism, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { CopyToClipboard } from 'react-copy-to-clipboard-ts';
import { FiCopy, FiCheck } from 'react-icons/fi';
import ExpandableDialog from '~/app/components/ExpandableDialog';
import { syntaxHighlighterStyle } from './styles';

const SyntaxHighlighter = (Prism as any) as React.FC<SyntaxHighlighterProps>;

interface Props {
  code: string;
  language: string;
  open: boolean;
  onClose: () => void;
}

const CodeBlockModal: React.FC<Props> = ({ code, language, open, onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ExpandableDialog
      title={language}
      open={open}
      onClose={onClose}
      className="w-full max-w-4xl h-[80vh]"
      titleBarAddon={
        <CopyToClipboard text={code} onCopy={handleCopy}>
          <button
            className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
            title={copied ? "Copied" : "Copy"}
          >
            {copied ? <FiCheck /> : <FiCopy />}
          </button>
        </CopyToClipboard>
      }
    >
      <div className="flex-1 overflow-auto">
        <SyntaxHighlighter
          language={language}
          style={vscDarkPlus}
          customStyle={{
            ...syntaxHighlighterStyle,
            height: '100%',
            width: '100%',
          }}
          wrapLines={true}
          lineProps={{ style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all' } }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </ExpandableDialog>
  );
};

export default CodeBlockModal;