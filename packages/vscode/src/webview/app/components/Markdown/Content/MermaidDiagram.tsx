import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import mermaid from 'mermaid';
import { Prism, SyntaxHighlighterProps } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { CopyToClipboard } from 'react-copy-to-clipboard-ts';
import { FiCopy, FiCheck, FiEye, FiCode, FiMaximize2 } from 'react-icons/fi';
import ExpandableDialog from '~/app/components/ExpandableDialog';
import { codeFontFamily, syntaxHighlighterStyle } from './styles';

const SyntaxHighlighter = (Prism as any) as React.FC<SyntaxHighlighterProps>;

let mermaidInitialized = false;

function ensureMermaidInit() {
  if (!mermaidInitialized) {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'default',
      securityLevel: 'loose',
    });
    mermaidInitialized = true;
  }
}

interface RenderProps {
  code: string;
  contained?: boolean;
}

const MermaidRender: React.FC<RenderProps> = ({ code, contained }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ensureMermaidInit();

    let cancelled = false;
    const id = `mermaid-${Math.random().toString(36).slice(2)}`;

    mermaid.render(id, code).then(({ svg }) => {
      if (cancelled) return;
      if (ref.current) {
        ref.current.innerHTML = svg;
        const svgEl = ref.current.querySelector('svg');
        if (svgEl) {
          const vb = svgEl.getAttribute('viewBox');
          if (vb) {
            const parts = vb.split(' ').map(Number);
            const vbW = parts[2];
            if (vbW > 0) {
              svgEl.style.width = `${vbW}px`;
            }
          }
          svgEl.removeAttribute('height');
          svgEl.style.maxWidth = '100%';
          svgEl.style.height = 'auto';
          svgEl.style.display = 'block';
          if (contained) {
            svgEl.style.maxHeight = '100%';
          }
        }
        setError(null);
      }
    }).catch((err) => {
      if (cancelled) return;
      setError(String(err?.message ?? err));
    });

    return () => { cancelled = true; };
  }, [code, contained]);

  if (error) {
    return (
      <ErrorBox>
        <ErrorText>{error}</ErrorText>
      </ErrorBox>
    );
  }

  return contained
    ? <RenderedDiagramContained ref={ref} />
    : <RenderedDiagram ref={ref} />;
};

interface Props {
  code: string;
}

const MermaidDiagram: React.FC<Props> = ({ code }) => {
  const [previewing, setPreviewing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Container>
        <Bar>
          <Language>mermaid</Language>
          <ButtonGroup>
            <ToggleButton onClick={() => setPreviewing((v) => !v)}>
              {previewing
                ? <><FiCode /><span>Code</span></>
                : <><FiEye /><span>Preview</span></>}
            </ToggleButton>
            <IconButton aria-label="expand" onClick={() => setIsModalOpen(true)}>
              <FiMaximize2 />
            </IconButton>
            <CopyToClipboard text={code} onCopy={handleCopy}>
              <IconButton aria-label="copy">
                {copied ? <FiCheck /> : <FiCopy />}
              </IconButton>
            </CopyToClipboard>
          </ButtonGroup>
        </Bar>
        {previewing
          ? <MermaidRender code={code} />
          : (
            <SyntaxHighlighter
              language="mermaid"
              style={vscDarkPlus}
              customStyle={syntaxHighlighterStyle}
              wrapLines={true}
              lineProps={{ style: { whiteSpace: 'pre-wrap', wordBreak: 'break-all' } }}
            >
              {code}
            </SyntaxHighlighter>
          )}
      </Container>
      <MermaidModal
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        code={code}
      />
    </>
  );
};

interface ModalProps {
  code: string;
  open: boolean;
  onClose: () => void;
}

const MermaidModal: React.FC<ModalProps> = ({ code, open, onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <ExpandableDialog
      title="mermaid"
      open={open}
      onClose={onClose}
      className="w-full max-w-4xl h-[80vh]"
      titleBarAddon={
        <CopyToClipboard text={code} onCopy={handleCopy}>
          <button
            className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
            title={copied ? 'Copied' : 'Copy'}
          >
            {copied ? <FiCheck /> : <FiCopy />}
          </button>
        </CopyToClipboard>
      }
    >
      <ModalBody>
        {open && <MermaidRender code={code} contained />}
      </ModalBody>
    </ExpandableDialog>
  );
};

const Container = styled.div`
  border: 1px solid #2d2d2d;
  border-radius: 4px;
  overflow: auto;
  margin: 10px 0;
`;

const Bar = styled.div`
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
  align-items: center;
`;

const IconButton = styled.button`
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

const ToggleButton = styled(IconButton)`
  gap: 4px;
  font-size: 0.85em;
`;

const RenderedDiagram = styled.div`
  padding: 12px;
  overflow: auto;
  background: #ffffff;
  max-height: 600px;

  & svg {
    width: auto;
    max-width: 100%;
    height: auto;
    display: block;
  }
`;

const RenderedDiagramContained = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: #ffffff;

  & svg {
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 100%;
    display: block;
  }
`;

const ErrorBox = styled.div`
  padding: 12px;
  background: #2a1f1f;
`;

const ModalBody = styled.div`
  flex: 1;
  overflow: hidden;
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
`;

const ErrorText = styled.pre`
  color: #ff8080;
  white-space: pre-wrap;
  font-size: 0.85em;
  margin: 0;
`;

export default MermaidDiagram;
