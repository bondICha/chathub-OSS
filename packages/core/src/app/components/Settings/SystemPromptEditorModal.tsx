import { useTranslation } from 'react-i18next';
import { FC, useState, useEffect } from 'react';
import ExpandableDialog from '../ExpandableDialog';
import { Textarea } from '../Input';
import Button from '../Button';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  onClose: () => void;
  value: string;
  onSave: (newValue: string) => boolean | void;
  title?: string;
  placeholder?: string;
  isJsonMode?: boolean;
}

const SystemPromptEditorModal: FC<Props> = ({ open, onClose, value, onSave, title, placeholder, isJsonMode = false }) => {
  const { t } = useTranslation();
  const [tempValue, setTempValue] = useState(value);
  const [isValidJson, setIsValidJson] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Reset tempValue when modal opens with new value
  useEffect(() => {
    if (open) {
      setTempValue(value);
      setValidationError(null);
      if (isJsonMode) {
        setIsValidJson(validateJson(value));
      }
    }
  }, [open, value, isJsonMode]);

  const validateJson = (jsonString: string): boolean => {
    try {
      JSON.parse(jsonString);
      setValidationError(null);
      return true;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      setValidationError(errorMsg);
      return false;
    }
  };

  const handleChange = (newValue: string) => {
    setTempValue(newValue);
    if (isJsonMode) {
      setIsValidJson(validateJson(newValue));
    }
  };

  const formatJson = () => {
    if (!isJsonMode) return;

    try {
      const parsed = JSON.parse(tempValue);
      const formatted = JSON.stringify(parsed, null, 2);
      setTempValue(formatted);
      setIsValidJson(true);
    } catch {
      toast.error(t('Invalid JSON format'));
    }
  };

  const handleSave = () => {
    if (isJsonMode && !isValidJson) {
      toast.error(t('Invalid JSON format'));
      return;
    }

    const result = onSave(tempValue);
    if (result !== false) {
      onClose();
    }
  };

  return (
    <ExpandableDialog
      title={title || t('Edit System Prompt')}
      open={open}
      onClose={onClose}
      className="w-full max-w-4xl max-h-[800px]"
    >
      <div className="flex-1 flex flex-col p-4 gap-4 overflow-y-auto">
        {isJsonMode && (
          <>
            <div className="flex justify-between items-center mb-2">
              <div className="flex flex-col">
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {isValidJson ? t('Valid JSON') : t('Invalid JSON format')}
                </span>
                {!isValidJson && validationError && (
                  <span className="text-xs text-red-600 dark:text-red-400 mt-1 font-mono max-w-md truncate">
                    {validationError}
                  </span>
                )}
              </div>
              <Button
                text={t('Format JSON')}
                color="flat"
                size="small"
                onClick={formatJson}
              />
            </div>
          </>
        )}

        {isJsonMode ? (
          <textarea
            className={`w-full flex-1 resize-none min-h-[400px] pr-2 font-mono text-sm p-3 rounded-md border-0 shadow-sm ring-1 ring-inset ${
              isValidJson
                ? 'ring-gray-300 dark:ring-gray-600 focus:ring-2 focus:ring-inset focus:ring-blue-500 dark:focus:ring-blue-400 bg-white dark:bg-gray-700 text-[#303030] dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500'
                : 'ring-red-300 dark:ring-red-600 focus:ring-2 focus:ring-inset focus:ring-red-500 dark:focus:ring-red-400 bg-red-50 dark:bg-red-900/20 text-red-900 dark:text-red-200 placeholder:text-red-400 dark:placeholder:text-red-500'
            }`}
            value={tempValue}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={placeholder}
            autoFocus
            spellCheck={false}
          />
        ) : (
          <Textarea
            className="w-full flex-1 resize-none min-h-[400px] pr-2" // pr-2 to avoid scrollbar overlapping
            value={tempValue}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={placeholder}
            autoFocus
          />
        )}

        <div className="flex justify-end gap-2 flex-shrink-0">
          <Button
            text={t('Cancel')}
            color="flat"
            onClick={onClose}
          />
          <Button
            text={t('Save')}
            color="primary"
            onClick={handleSave}
            disabled={isJsonMode && !isValidJson}
          />
        </div>
      </div>
    </ExpandableDialog>
  );
};

export default SystemPromptEditorModal;
