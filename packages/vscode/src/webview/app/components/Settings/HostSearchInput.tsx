import { FC, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '../Input';
import { getHostSuggestions } from '~/../config/providers/provider-defaults';

interface HostSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

const HostSearchInput: FC<HostSearchInputProps> = ({
  value,
  onChange,
  placeholder,
  disabled = false,
  className = ''
}) => {
  const { t } = useTranslation();
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredHosts, setFilteredHosts] = useState<string[]>([]);

  // Get host suggestions from provider defaults
  const getAllHosts = (): string[] => {
    return getHostSuggestions();
  };

  // Load and filter hosts based on input value
  useEffect(() => {
    const allHosts = getAllHosts();
    if (!value || value.trim() === '') {
      setFilteredHosts(allHosts);
    } else {
      const filtered = allHosts.filter((host: string) =>
        host.toLowerCase().includes(value.toLowerCase())
      );
      setFilteredHosts(filtered);
    }
  }, [value]);

  const handleInputFocus = () => {
    setShowSuggestions(true);
  };

  const handleInputBlur = () => {
    // Delay hiding suggestions to allow clicking on them
    setTimeout(() => setShowSuggestions(false), 200);
  };

  const handleSuggestionClick = (host: string) => {
    onChange(host);
    setShowSuggestions(false);
  };

  return (
    <div className={`relative ${className}`}>
      <Input
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.currentTarget.value)}
        onFocus={handleInputFocus}
        onBlur={handleInputBlur}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full"
      />
      
      {showSuggestions && filteredHosts.length > 0 && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-60 overflow-y-auto">
          <div className="p-2">
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
              {value.trim() === '' ? t('All hosts') : t('Matching hosts')}
            </div>
            {filteredHosts.map((host, index) => (
              <button
                key={index}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                onClick={() => handleSuggestionClick(host)}
              >
                {host}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default HostSearchInput;
