import React, { useState } from 'react';
import styled from 'styled-components';
import { Prism, SyntaxHighlighterProps } from 'react-syntax-highlighter'; // SyntaxHighlighterProps もインポート
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

// 型アサーションを使用して型エラーを回避
const SyntaxHighlighter = (Prism as any) as React.FC<SyntaxHighlighterProps>;
import { CopyToClipboard } from 'react-copy-to-clipboard-ts';
import { FiCopy, FiCheck, FiMaximize2 } from 'react-icons/fi';
import CodeBlockModal from './CodeBlockModal';
import { syntaxHighlighterStyle, codeFontFamily } from './styles';

interface Props {
  code: string;
  language: string;
}

const CodeBlock: React.FC<Props> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Container>
        <CodeBar>
          <Language>{language}</Language>
          <ButtonGroup>
            <ExpandButton onClick={() => setIsModalOpen(true)}>
              <FiMaximize2 />
            </ExpandButton>
            <CopyToClipboard text={code} onCopy={handleCopy}>
              <CopyButton>
                {copied ? <FiCheck /> : <FiCopy />}
              </CopyButton>
            </CopyToClipboard>
          </ButtonGroup>
        </CodeBar>
        <SyntaxHighlighter
          language={language}
          style={vscDarkPlus}
          customStyle={syntaxHighlighterStyle}
          wrapLines={true}
          lineProps={{ style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all' } }}
        >
            {code}
        </SyntaxHighlighter>
      </Container>

      <CodeBlockModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        code={code}
        language={language}
      />
    </>
  );
};

const Container = styled.div`
  border: 1px solid #2d2d2d;
  border-radius: 4px;
  overflow: auto;
`;

const CodeBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #1e1e1e;
  padding: 8px 16px;
  border-bottom: 1px solid #2d2d2d;
`;

const Language = styled.span`
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9em;
  font-family: ${codeFontFamily};
`;

const ButtonGroup = styled.div`
  display: flex;
  gap: 8px;
`;

const Button = styled.button`
  background: none;
  border: none;
  color: #fff;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  
  &:hover {
    color: #0066cc;
  }
`;

const CopyButton = styled(Button)``;
const ExpandButton = styled(Button)``;

export default CodeBlock;