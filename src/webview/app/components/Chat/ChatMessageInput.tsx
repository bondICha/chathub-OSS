import {
  FloatingList,
  FloatingPortal,
  arrow,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
  useListNavigation,
  useRole,
} from '@floating-ui/react'
import { fileOpen } from 'browser-fs-access'
import { cx } from '~/utils'
import { ClipboardEventHandler, FC, ReactNode, memo, useCallback, useMemo, useRef, useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { GoBook, GoImage, GoFile, GoFileMedia, GoFileCode } from 'react-icons/go'
import { AiOutlineFilePdf } from 'react-icons/ai'
import { BiExpand } from 'react-icons/bi'
import { RiDeleteBackLine, RiCloseLine } from 'react-icons/ri'
import { Prompt } from '~services/prompts'
import Button from '../Button'
import Tooltip from '../Tooltip'
import AudioWaveIcon from '../icons/AudioWaveIcon'
import PromptCombobox, { ComboboxContext } from '../PromptCombobox'
import PromptLibraryDialog from '../PromptLibrary/Dialog'
import ExpandableDialog from '../ExpandableDialog'
import TextInput from './TextInput';
import { processFile, ProcessedFileResult } from '~app/utils/file-processor';
import TranscribeModal from './TranscribeModal';
import { transcribeWithOpenAI, transcribeWithGemini } from '~services/sst-service';
import { getUserConfig } from '~services/user-config';
import toast from 'react-hot-toast';
import './ChatMessageInput.scss';

export interface Attachment {
  id: string;
  file: File;
  type: 'image' | 'text' | 'audio' | 'video' | 'pdf';
  content?: string;
  transcribedText?: string; // For audio files
}

interface Props {
  mode: 'full' | 'compact'
  onSubmit: (value: string, images?: File[], attachments?: { name: string; content: string }[], audioFiles?: File[], videoFiles?: File[], pdfFiles?: File[]) => void
  className?: string
  disabled?: boolean
  placeholder?: string
  actionButton?: ReactNode | null
  autoFocus?: boolean
  supportImageInput?: boolean
  supportAudioInput?: boolean // New prop
  maxRows?: number
  fullHeight?: boolean
  onHeightChange?: (height: number) => void
  onVisibilityChange?: (visible: boolean) => void
  // Controlled state props (optional - for maintaining state across layout changes)
  controlledValue?: string
  onControlledValueChange?: (value: string) => void
  controlledAttachments?: Attachment[]
  onControlledAttachmentsChange?: (attachments: Attachment[] | ((prev: Attachment[]) => Attachment[])) => void
}

const ChatMessageInput: FC<Props> = (props) => {
  const { t } = useTranslation()
  const {
    placeholder = t('singlebot_input_placeholder'),
    fullHeight = false,
    onHeightChange,
    onVisibilityChange,
    controlledValue,
    onControlledValueChange,
    controlledAttachments,
    onControlledAttachmentsChange,
    ...restProps
  } = props

  // Use controlled state if provided, otherwise use local state
  const isControlled = controlledValue !== undefined && onControlledValueChange !== undefined
  const [localValue, setLocalValue] = useState('')
  const [localAttachments, setLocalAttachments] = useState<Attachment[]>([])

  const value = isControlled ? controlledValue : localValue
  const setValue = isControlled ? onControlledValueChange : setLocalValue

  const isAttachmentsControlled = controlledAttachments !== undefined && onControlledAttachmentsChange !== undefined
  const attachments = isAttachmentsControlled ? controlledAttachments : localAttachments

  // Wrapper for setAttachments to handle both controlled and uncontrolled cases
  const setAttachments = useCallback((update: Attachment[] | ((prev: Attachment[]) => Attachment[])) => {
    if (isAttachmentsControlled && onControlledAttachmentsChange) {
      // Pass updater directly to Jotai setter (supports both value and updater function)
      onControlledAttachmentsChange(update)
    } else {
      // For uncontrolled state, just use the local setter
      setLocalAttachments(update)
    }
  }, [isAttachmentsControlled, onControlledAttachmentsChange])
  const [editingAttachment, setEditingAttachment] = useState<Attachment | null>(null);
  const formRef = useRef<HTMLFormElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [isPromptLibraryDialogOpen, setIsPromptLibraryDialogOpen] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const [isDragging, setIsDragging] = useState(false);
  const [showAttachmentPopup, setShowAttachmentPopup] = useState(true);
 
         const [activeIndex, setActiveIndex] = useState<number | null>(null)
 
         const [isComboboxOpen, setIsComboboxOpen] = useState(false)
 
         const [transcribeFile, setTranscribeFile] = useState<File | null>(null);

         const [isTranscribeModalOpen, setIsTranscribeModalOpen] = useState(false);

         const [transcribingFileId, setTranscribingFileId] = useState<string | null>(null);

  const getUnsupportedFileErrorMessage = useCallback(
    (result: Extract<ProcessedFileResult, { type: 'unsupported' }>) => {
      switch (result.error.code) {
        case 'unsupported_audio_format':
          return t('file_error_unsupported_audio_format', {
            type: result.error.info.mimeType,
            supported: result.error.info.supported
          });
        case 'pdf_not_supported':
          return t('file_error_pdf_not_supported', { name: result.file.name });
        case 'binary_not_supported':
          return t('file_error_binary_not_supported', { name: result.file.name });
        case 'process_failed':
          return t('file_error_process_failed', {
            name: result.file.name,
            message: result.error.info.message
          });
        default:
          return t('file_error_process_failed', {
            name: result.file.name,
            message: 'Unknown error'
          });
      }
    },
    [t],
  )



         const { refs, floatingStyles, context} = useFloating({

         whileElementsMounted: autoUpdate,    middleware: [offset(15), flip(), shift()],
    placement: 'top-start',
    open: isComboboxOpen,
    onOpenChange: setIsComboboxOpen,
  })

  // Attachment popup floating
  const floatingListRef = useRef([])
  const arrowRef = useRef<HTMLDivElement>(null)

  const {
    refs: attachmentRefs,
    floatingStyles: attachmentFloatingStyles,
    middlewareData: attachmentMiddlewareData,
  } = useFloating({
    whileElementsMounted: autoUpdate,
    middleware: [offset(12), flip(), shift(), arrow({ element: arrowRef })],
    placement: 'top-start',
    open: showAttachmentPopup,
  })
  const dragCounterRef = useRef(0)
  const dragOverTimerRef = useRef<number | null>(null)

  const handleSelect = useCallback((p: Prompt) => {
    if (p.id === 'PROMPT_LIBRARY') {
      setIsPromptLibraryDialogOpen(true)
      setIsComboboxOpen(false)
    } else {
      setValue(p.prompt)
      setIsComboboxOpen(false)
      inputRef.current?.focus()
    }
  }, [])

  const listNavigation = useListNavigation(context, {
    listRef: floatingListRef,
    activeIndex,
    onNavigate: setActiveIndex,
    loop: true,
    focusItemOnOpen: false,
    openOnArrowKeyDown: false,
  })

  const dismiss = useDismiss(context)
  const role = useRole(context, { role: 'listbox' })

  const { getReferenceProps, getFloatingProps, getItemProps } = useInteractions([role, dismiss, listNavigation])

  const comboboxContext = useMemo(
    () => ({
      activeIndex,
      getItemProps,
      handleSelect,
      setIsComboboxOpen: (open: boolean) => {
        setIsComboboxOpen(open)
        if (open) {

        } else {
          inputRef.current?.focus()
        }
      },
    }),
    [activeIndex, getItemProps, handleSelect],
  )

  const handleTranscribe = useCallback(async (provider: 'openai' | 'gemini' | 'none', modelOrBotId: string, providerIdOrBotIndex: string) => {
    if (!transcribeFile) return;

    const tempId = `${transcribeFile.name}-${transcribeFile.lastModified}-${Math.random()}`;

    // If provider is 'none', just add audio without transcription
    if (provider === 'none') {
      setAttachments(prev => [...prev, {
        id: tempId,
        file: transcribeFile,
        type: 'audio',
        transcribedText: undefined  // No transcription
      }]);
      setTranscribeFile(null);
      toast.success(t('Audio file attached without transcription'), { duration: 3000 });
      return;
    }

    try {
      // Add temporary attachment with loading state
      setAttachments(prev => [...prev, {
        id: tempId,
        file: transcribeFile,
        type: 'audio',
        transcribedText: ''
      }]);
      setTranscribingFileId(tempId);

      toast.loading(t('Transcribing audio...'), { id: 'transcribing' });
      let result;

      if (provider === 'openai') {
        result = await transcribeWithOpenAI(transcribeFile, providerIdOrBotIndex, modelOrBotId as any);
      } else {
        const botIndex = parseInt(providerIdOrBotIndex, 10);
        if (Number.isNaN(botIndex)) {
          throw new Error('Invalid Gemini bot index');
        }
        result = await transcribeWithGemini(transcribeFile, botIndex);
      }

        if (result.text) {
          toast.success(t('Transcription complete'), { id: 'transcribing' });
          // Update attachment with transcribed text
          setAttachments(prev => prev.map(a =>
            a.id === tempId ? { ...a, transcribedText: result.text } : a
          ));
        } else {
          throw new Error(result.error || 'No text returned');
        }
      } catch (error) {
        console.error('Transcription error:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        toast.error(`${t('Transcription failed')}: ${errorMessage}`, {
          id: 'transcribing',
          duration: 5000  // Show error for 5 seconds
        });
        alert(`DEBUG: ${t('Transcription failed')}\n\nError: ${errorMessage}\n\nFile: ${transcribeFile.name}\nSize: ${(transcribeFile.size / (1024 * 1024)).toFixed(2)}MB`);
        // Remove failed attachment
        setAttachments(prev => prev.filter(a => a.id !== tempId));
      } finally {
        setTranscribingFileId(null);
        setTranscribeFile(null);
      }
    }, [transcribeFile, t, setAttachments]);
  
    const onFormSubmit = useCallback(
      (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const textAttachments = attachments
          .filter(a => a.type === 'text')
          .map(a => ({ name: a.file.name, content: a.content || '' }));
        const images = attachments.filter(a => a.type === 'image').map(a => a.file);
        
        const audioAttachments = attachments.filter(a => a.type === 'audio');

        // Always include audio files regardless of bot capability.
        // use-chat.ts will decide whether to use them based on bot's supportsAudioInput.
        const audioFiles: File[] = audioAttachments.map(a => a.file);

        const transcriptAttachments: { name: string; content: string }[] = audioAttachments
          .filter(a => a.transcribedText)
          .map(a => ({
            name: `${a.file.name} (Transcript)`,
            content: a.transcribedText || ''
          }));

        const allTextAttachments = [...textAttachments, ...transcriptAttachments];
        const videoFiles = attachments.filter(a => a.type === 'video').map(a => a.file);
        const pdfFiles = attachments.filter(a => a.type === 'pdf').map(a => a.file);

        if (value.trim() || images.length > 0 || allTextAttachments.length > 0 || audioFiles.length > 0 || videoFiles.length > 0 || pdfFiles.length > 0) {
          props.onSubmit(value, images, allTextAttachments, audioFiles, videoFiles, pdfFiles);
          setValue('');
          setAttachments([]);
          setShowAttachmentPopup(false);
        }
      },
      [attachments, props, value],
    );
  const onValueChange = useCallback((v: string) => {
    setValue(v)
    setIsComboboxOpen(v === '/')
    // Hide attachment popup when user starts typing
    if (v.length > 0 && showAttachmentPopup) {
      setShowAttachmentPopup(false)
    }
  }, [showAttachmentPopup])

  const modalSubmit = useCallback(() => {
    const textAttachments = attachments
      .filter(a => a.type === 'text')
      .map(a => ({ name: a.file.name, content: a.content || '' }));
    const images = attachments.filter(a => a.type === 'image').map(a => a.file);
    
    const audioAttachments = attachments.filter(a => a.type === 'audio');

    // Always include audio files regardless of bot capability.
    const audioFiles: File[] = audioAttachments.map(a => a.file);

    const transcriptAttachments: { name: string; content: string }[] = audioAttachments
      .filter(a => a.transcribedText)
      .map(a => ({
        name: `${a.file.name} (Transcript)`,
        content: a.transcribedText || ''
      }));

    const allTextAttachments = [...textAttachments, ...transcriptAttachments];
    const videoFiles = attachments.filter(a => a.type === 'video').map(a => a.file);
    const pdfFiles = attachments.filter(a => a.type === 'pdf').map(a => a.file);

    if (value.trim() || images.length > 0 || allTextAttachments.length > 0 || audioFiles.length > 0 || videoFiles.length > 0 || pdfFiles.length > 0) {
      props.onSubmit(value, images, allTextAttachments, audioFiles, videoFiles, pdfFiles);
      setValue('');
      setAttachments([]);
      setShowAttachmentPopup(false);
    }
    // Close modal first, then focus on main input after a delay
    setIsExpanded(false)
    // Delay focus to ensure modal is fully closed and events are cleared
    setTimeout(() => {
      inputRef.current?.focus()
    }, 100)
  }, [value, attachments, props.onSubmit, props.supportAudioInput])

  const insertTextAtCursor = useCallback(
    (text: string) => {
      const cursorPosition = inputRef.current?.selectionStart || 0
      const textBeforeCursor = value.slice(0, cursorPosition)
      const textAfterCursor = value.slice(cursorPosition)
      setValue(`${textBeforeCursor}${text}${textAfterCursor}`)
      setIsPromptLibraryDialogOpen(false)
      inputRef.current?.focus()
    },
    [value],
  )

  const openPromptLibrary = useCallback(() => {
    setIsPromptLibraryDialogOpen(true)
  }, [])

  const handleFileSelect = useCallback(async (files: File[]) => {
    for (const file of files) {
      const result = await processFile(file);
      const id = `${file.name}-${file.lastModified}-${Math.random()}`;

      switch (result.type) {
        case 'image':
          if (result.warning) {
            toast(t(result.warning.key, result.warning.params), { duration: 8000 });
          }
          setAttachments(prev => [...prev, { id, file, type: 'image' }]);
          break;
        case 'audio':
          if (result.warning) {
            toast(t(result.warning.key, result.warning.params), { duration: 8000 });
          }
          const maxSize = 20 * 1024 * 1024; // 20MB
          if (file.size > maxSize) {
            const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
            alert(`DEBUG: Audio file too large: ${file.name} (${sizeMB}MB / 20MB limit)`);
            break;
          }
          const existingAudio = attachments.find(a => a.type === 'audio');
          if (existingAudio) {
            alert(`DEBUG: Only one audio file allowed per message`);
            break;
          }

          // Always trigger transcribe workflow for audio files
          // Transcribed text will be used for non-audio-supporting bots,
          // while audio file will be sent directly to audio-supporting bots
          setTranscribeFile(file);
          setIsTranscribeModalOpen(true);
          break;
        case 'video':
          if (result.warning) {
            toast(t(result.warning.key, result.warning.params), { duration: 8000 });
          }
          setAttachments(prev => [...prev, { id, file, type: 'video' }]);
          break;
        case 'text':
          if (result.warning) {
            toast(t(result.warning.key, result.warning.params), { duration: 4000 });
          }
          setAttachments(prev => [...prev, { id, file, type: result.type, content: result.content }]);
          break;
        case 'pdf':
          setAttachments(prev => [...prev, { id, file, type: 'pdf' }]);
          break;
        case 'unsupported':
          toast.error(getUnsupportedFileErrorMessage(result));
          break; // Don't add unsupported files
      }
    }
    inputRef.current?.focus();
  }, [attachments]);

  const selectAttachments = useCallback(async () => {
    const files = await fileOpen({
      multiple: true,
    });
    handleFileSelect(files);
  }, [handleFileSelect]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  const onPaste: ClipboardEventHandler<HTMLTextAreaElement> = useCallback(
    (event) => {
      const items = Array.from(event.clipboardData.items);
      const files = items.map(item => item.getAsFile()).filter((f): f is File => !!f);
      
      if (files.length > 0) {
        event.preventDefault();
        handleFileSelect(files);
      }
    },
    [handleFileSelect],
  );
  
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    setIsDragging(true);
  }, []);
 
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);
 
  const handleDragOver = useCallback((e: React.DragEvent<HTMLFormElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
    if (dragOverTimerRef.current) {
      clearTimeout(dragOverTimerRef.current);
    }
    dragOverTimerRef.current = window.setTimeout(() => {
      dragCounterRef.current = 0;
      setIsDragging(false);
      dragOverTimerRef.current = null;
    }, 200);
  }, [isDragging]);
 
  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLFormElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (dragOverTimerRef.current) {
        clearTimeout(dragOverTimerRef.current);
        dragOverTimerRef.current = null;
      }
      setIsDragging(false);
      dragCounterRef.current = 0;
 
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        handleFileSelect(files);
      }
    },
    [handleFileSelect],
  );
 
   const handleBlur = useCallback(() => {
     setTimeout(() => {
       if (!formRef.current?.contains(document.activeElement)) {
        setIsFocused(false)
      }
    }, 100)
  }, [])

  const isCompactMode = props.mode === 'compact'
  const hasContent = value.length > 0 || attachments.length > 0
  const shouldShowInput = !isCompactMode || (isCompactMode && (isFocused || hasContent))
  const attachmentTooltipContent = useMemo(
    () => (
      <div className="attachment-tooltip">
        <table>
          <thead>
            <tr>
              <th>{t('Attachment tooltip header type')}</th>
              <th>{t('Attachment tooltip header details')}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{t('Attachment tooltip row text label')}</td>
              <td>{t('Attachment tooltip row text detail')}</td>
            </tr>
            <tr>
              <td>{t('Attachment tooltip row audio label')}</td>
              <td>{t('Attachment tooltip row audio detail')}</td>
            </tr>
            <tr>
              <td>{t('Attachment tooltip row image label')}</td>
              <td>{t('Attachment tooltip row image detail')}</td>
            </tr>
            <tr>
              <td>{t('Attachment tooltip row video label')}</td>
              <td>{t('Attachment tooltip row video detail')}</td>
            </tr>
            <tr>
              <td>{t('Attachment tooltip row pdf label')}</td>
              <td>{t('Attachment tooltip row pdf detail')}</td>
            </tr>
          </tbody>
        </table>
      </div>
    ),
    [t],
  )

  useEffect(() => {
    if (isCompactMode) {
      onVisibilityChange?.(shouldShowInput)
    }
  }, [isCompactMode, shouldShowInput, onVisibilityChange])

  // Cleanup drag-over debounce timer on unmount to avoid leaks
  useEffect(() => {
    return () => {
      if (dragOverTimerRef.current) {
        clearTimeout(dragOverTimerRef.current)
      }
    }
  }, [])

  return (
    <form
      className={cx(
        'relative flex flex-row items-center',
        fullHeight && 'h-full',
        props.className,
        !isCompactMode && 'gap-3',
        isCompactMode && (shouldShowInput ? 'gap-3' : 'gap-0'),
      )}
      onSubmit={onFormSubmit}
      ref={formRef}
      onFocus={() => setIsFocused(true)}
      onBlur={handleBlur}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-10 rounded-xl bg-black/10 dark:bg-white/5 flex items-center justify-center">
          <div className="flex flex-row items-center justify-center gap-3 px-4 py-3 rounded-lg border-2 border-dashed border-blue-500 bg-white/70 dark:bg-black/40">
            <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
              <GoImage size={18} />
              <GoFile size={18} />
            </div>
            <span className="text-sm font-semibold text-primary-text">{t('Drop files to attach')}</span>
            <span className="text-xs text-secondary-text">({t('Images and text files are supported')})</span>
          </div>
        </div>
      )}
      <div className={cx('flex items-center gap-3', isCompactMode && !shouldShowInput && 'hidden')}>
        {props.mode === 'full' && (
          <>
            <GoBook
              size={22}
              className="cursor-pointer text-secondary-text hover:text-primary-text transition-colors duration-200"
              onClick={openPromptLibrary}
              title="Prompt library"
            />
            {isPromptLibraryDialogOpen && (
              <PromptLibraryDialog
                isOpen={true}
                onClose={() => setIsPromptLibraryDialogOpen(false)}
                insertPrompt={insertTextAtCursor}
              />
            )}
            <ComboboxContext.Provider value={comboboxContext}>
              {isComboboxOpen && (
                <FloatingPortal>
                  <div
                    ref={refs.setFloating}
                    style={{ ...floatingStyles, zIndex: 9999 }}
                    {...getFloatingProps()}
                  >
                    <FloatingList elementsRef={floatingListRef}>
                      <PromptCombobox />
                    </FloatingList>
                  </div>
                </FloatingPortal>
              )}
            </ComboboxContext.Provider>
            {props.supportImageInput && (
              <div className="relative">
                <Tooltip content={attachmentTooltipContent} align="start">
                  <button
                    type="button"
                    ref={attachmentRefs.setReference}
                    className="group flex items-center justify-center text-secondary-text hover:text-primary-text transition-colors duration-200"
                    onClick={selectAttachments}
                    aria-label={t('Attach files')}
                    title={t('Attach files')}
                  >
                    <span className="attachment-rotator">
                      <span className="attachment-rotator__icon attachment-rotator__icon--text">
                        <GoFileCode size={20} />
                      </span>
                      <span className="attachment-rotator__icon attachment-rotator__icon--audio">
                        <AudioWaveIcon size={20} />
                      </span>
                      <span className="attachment-rotator__icon attachment-rotator__icon--image">
                        <GoImage size={20} />
                      </span>
                      <span className="attachment-rotator__icon attachment-rotator__icon--video">
                        <GoFileMedia size={20} className="text-purple-500 dark:text-purple-400" />
                      </span>
                      <span className="attachment-rotator__icon attachment-rotator__icon--pdf">
                        <AiOutlineFilePdf size={22} className="text-red-500 dark:text-red-400" />
                      </span>
                    </span>
                  </button>
                </Tooltip>
                {showAttachmentPopup && (
                  <FloatingPortal>
                    <div
                      ref={attachmentRefs.setFloating}
                      style={attachmentFloatingStyles}
                      className="attachment-popup"
                    >
                      <button
                        type="button"
                        className="attachment-popup__close"
                        onClick={() => setShowAttachmentPopup(false)}
                        aria-label={t('Close')}
                        title={t('Close')}
                      >
                        <RiCloseLine size={20} />
                      </button>
                      <div className="attachment-popup__text">{t('Attachment popup hint')}</div>
                      <div
                        ref={arrowRef}
                        className="attachment-popup__arrow"
                        style={{
                          left: attachmentMiddlewareData.arrow?.x != null ? `${attachmentMiddlewareData.arrow.x}px` : '',
                          top: attachmentMiddlewareData.arrow?.y != null ? `${attachmentMiddlewareData.arrow.y}px` : '',
                        }}
                      />
                    </div>
                  </FloatingPortal>
                )}
              </div>
            )}
          </>
        )}
        <BiExpand
          size={props.mode === 'compact' ? 16 : 22}
          className={cx(
            'cursor-pointer transition-colors duration-200',
            props.mode === 'compact'
              ? 'text-light-text hover:text-primary-text'
              : 'text-secondary-text hover:text-primary-text',
          )}
          onClick={() => setIsExpanded(true)}
          title={t('Compose Message')}
        />
      </div>
      <div
        className={cx('w-full flex flex-col justify-start', fullHeight && 'h-full')}
        ref={refs.setReference}
        {...getReferenceProps()}
      >
        {isCompactMode && !shouldShowInput ? null : attachments.length > 0 ? (
          <div className="flex flex-row items-center flex-wrap w-full mb-1 gap-2">
            {attachments.map((att) => (
              <div
                key={att.id}
                className="flex items-center gap-1 bg-primary-border dark:bg-secondary rounded-full px-2 py-1 border border-primary-border cursor-pointer"
                onClick={() => (att.type === 'text' || (att.type === 'audio' && att.transcribedText)) && setEditingAttachment(att)}
              >
                {att.type === 'image' && <GoImage size={12} className="text-secondary-text" />}
                {att.type === 'text' && <GoFile size={12} className="text-secondary-text" />}
                {att.type === 'pdf' && <AiOutlineFilePdf size={12} className="text-red-500 dark:text-red-400" />}
                {att.type === 'video' && <GoFileMedia size={12} className="text-purple-500 dark:text-purple-400" />}
                {att.type === 'audio' && (
                  transcribingFileId === att.id ? (
                    <div className="animate-spin">
                      <GoFileMedia size={12} className="text-blue-500 dark:text-blue-400" />
                    </div>
                  ) : (
                    <GoFileMedia size={12} className="text-secondary-text" />
                  )
                )}
                <span className="text-xs text-primary-text font-semibold cursor-default truncate max-w-[100px] ml-1">
                  {att.file.name}
                </span>
                {att.type === 'text' && att.content && (
                  <span className="text-xs text-secondary-text ml-1">
                    ({att.content.length} {t('chars')})
                  </span>
                )}
                <RiDeleteBackLine
                  size={12}
                  className="cursor-pointer text-secondary-text hover:text-primary-text transition-colors duration-200 hover:scale-110 ml-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeAttachment(att.id);
                  }}
                />
              </div>
            ))}
          </div>
        ) : null}
        <TextInput
          ref={inputRef}
          formref={formRef}
          name="input"
          disabled={props.disabled}
          placeholder={placeholder as string}
          value={value}
          onValueChange={onValueChange}
          autoFocus={props.autoFocus}
          onPaste={onPaste}
          maxRows={props.maxRows}
          fullHeight={fullHeight}
          onHeightChange={onHeightChange}
          className={cx(isCompactMode && !shouldShowInput && 'text-center', value.startsWith('/btw') && 'text-btw')}
        />
      </div>
      {isCompactMode && !shouldShowInput
        ? null
        : props.actionButton || <Button text="-" className="invisible" size={props.mode === 'full' ? 'normal' : 'tiny'} />}

      {isExpanded && (
        <ExpandableDialog
          open={isExpanded}
          onClose={() => {
            setIsExpanded(false)
            // Delay focus to ensure modal is fully closed and events are cleared
            setTimeout(() => {
              inputRef.current?.focus()
            }, 100)
          }}
          title={t('Compose Message')}
          size="2xl"
          className="flex flex-col"
          footer={
            <div className="flex justify-end">
              <Button
                text={t('Send')}
                color="primary"
                onClick={modalSubmit}
                disabled={!value.trim()}
              />
            </div>
          }
        >
          <div className="p-4 h-full">
            <TextInput
              value={value}
              onValueChange={setValue}
              placeholder={t('Enter to add a new line')}
              className="w-full h-full resize-none outline-none bg-transparent text-base"
              autoFocus
              fullHeight
              onSubmit={modalSubmit}
            />
          </div>
        </ExpandableDialog>
      )}
      {editingAttachment && (
        <ExpandableDialog
          open={!!editingAttachment}
          onClose={() => setEditingAttachment(null)}
          title={editingAttachment.file.name}
          size="2xl"
          className="flex flex-col"
        >
          <div className="flex-grow p-4 flex flex-col gap-4">
            {editingAttachment.type === 'audio' && (
              <audio controls src={URL.createObjectURL(editingAttachment.file)} className="w-full" />
            )}
            <TextInput
              value={editingAttachment.content || editingAttachment.transcribedText || ''}
              onValueChange={(newContent) => {
                setEditingAttachment(prev => {
                  if (!prev) return null;
                  if (prev.type === 'audio') {
                    return { ...prev, transcribedText: newContent };
                  }
                  return { ...prev, content: newContent };
                });
              }}
              placeholder={t('Edit file content...')}
              className="w-full h-full resize-none outline-none bg-transparent text-base"
              autoFocus
              fullHeight
            />
          </div>
          <div className="flex justify-between items-center p-4 border-t border-primary-border">
            <span className="text-sm text-secondary-text">
              {t('Character count')}: {(editingAttachment.content || editingAttachment.transcribedText)?.length || 0}
            </span>
            <Button
              text={t('Save')}
              color="primary"
              onClick={() => {
                if (editingAttachment) {
                  setAttachments(prev => prev.map(a => a.id === editingAttachment.id ? editingAttachment : a));
                }
                setEditingAttachment(null);
              }}
            />
          </div>
        </ExpandableDialog>
      )}
      {isTranscribeModalOpen && (
        <TranscribeModal
          isOpen={isTranscribeModalOpen}
          onClose={() => {
            setIsTranscribeModalOpen(false);
            setTranscribeFile(null);
          }}
          onTranscribe={handleTranscribe}
        />
      )}
    </form>
  )
}

export default memo(ChatMessageInput)
