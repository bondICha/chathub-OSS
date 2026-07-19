import { FC, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { BiPencil } from 'react-icons/bi';
import IconSelect from './IconSelect';
import BotIcon from '../BotIcon';
import { Input } from '../Input';

// デフォルトアイコン
const defaultIcon = 'OpenAI.Black';

// 画像URLかどうか確認する正規表現
const isImageUrlRegex = /\.(jpg|jpeg|png|gif|svg|webp)($|\?)/i;

interface AvatarSelectProps {
  value: string;
  onChange: (value: string) => void;
  size?: number;
}

const AvatarSelect: FC<AvatarSelectProps> = ({ value, onChange, size = 36 }) => {
  const { t } = useTranslation();
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const [currentIconValue, setCurrentIconValue] = useState(defaultIcon);
  const [customUrl, setCustomUrl] = useState('');
  const avatarRef = useRef<HTMLDivElement>(null);
  const [panelPosition, setPanelPosition] = useState({ top: 0, left: 0 });
  const [urlMode, setUrlMode] = useState(false);
  
  // アイコン値を処理
  const processIconValue = (iconValue: string) => {
    // URLの場合はそのまま返し、URLモードを有効化
    if (iconValue && (iconValue.startsWith('http') || iconValue.startsWith('data:'))) {
      setUrlMode(true);
      setCustomUrl(iconValue);
      return iconValue;
    }
    
    // その他のアイコン識別子の場合
    setUrlMode(false);
    return iconValue || defaultIcon;
  };
  
  // コンポーネントがマウントされた時に初期値を設定
  useEffect(() => {
    setCurrentIconValue(processIconValue(value));
  }, [value]);
  
  // アイコン名を表示用にフォーマット
  const getIconDisplayName = (iconValue: string) => {
    if (!iconValue) return 'Default';
    
    // URLの場合は短縮表示
    if (iconValue.startsWith('http') || iconValue.startsWith('data:')) {
      return t('Custom Image URL');
    }
    
    // 特別なアイコン識別子の場合はフォーマットして表示
    if (iconValue.includes('.')) {
      const parts = iconValue.split('.');
      return parts[0];
    }
    
    return iconValue;
  };
  
  // アイコン変更時の処理
  const handleIconChange = (newValue: string) => {
    onChange(newValue);
    setCurrentIconValue(newValue);
    setIsSelectOpen(false);
  };
  
  // カスタムURLの適用
  const applyCustomUrl = () => {
    if (customUrl) {
      onChange(customUrl);
      setCurrentIconValue(customUrl);
      setIsSelectOpen(false);
    }
  };
  
  // URLモードとアイコン選択モードの切り替え
  const toggleUrlMode = () => {
    setUrlMode(!urlMode);
  };

  const handleTogglePanel = () => {
    if (avatarRef.current) {
      const rect = avatarRef.current.getBoundingClientRect();
      setPanelPosition({
        top: rect.bottom + window.scrollY,
        left: rect.left + window.scrollX,
      });
    }
    setIsSelectOpen(!isSelectOpen);
  };
  
  return (
    <div className="relative" ref={avatarRef}>
      {/* アイコン表示部分 */}
      <div
        className="relative group cursor-pointer"
        onClick={handleTogglePanel}
      >
        <div className="flex items-center justify-center overflow-hidden" style={{ width: size, height: size }}>
          <BotIcon iconName={currentIconValue} size={size} />
        </div>
        <div className="absolute inset-0 bg-black bg-opacity-50 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
          <BiPencil className="text-white w-1/3 h-1/3" />
        </div>
      </div>
      
      {isSelectOpen && createPortal(
        <div
          className="absolute mt-2 w-96 border rounded-lg p-4 bg-white dark:bg-gray-800 shadow-lg z-[9999]"
          style={{ top: panelPosition.top, left: panelPosition.left }}
        >
          {/* タブ切り替え */}
          <div className="flex border-b mb-4">
            <button
              className={`py-2 px-4 font-medium text-sm ${!urlMode ? 'border-b-2 border-blue-500 text-blue-500 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}
              onClick={() => setUrlMode(false)}
              type="button"
            >
              {t('Built-in Icons')}
            </button>
            <button
              className={`py-2 px-4 font-medium text-sm ${urlMode ? 'border-b-2 border-blue-500 text-blue-500 dark:text-blue-400' : 'text-gray-500 dark:text-gray-400'}`}
              onClick={() => setUrlMode(true)}
              type="button"
            >
              {t('Custom Image URL')}
            </button>
          </div>
          
          {urlMode ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 dark:text-gray-200">
                  {t('Enter image URL (jpg, png, svg, gif)')}
                </label>
                <div className="flex gap-2">
                  <Input
                    className="flex-1"
                    value={customUrl}
                    placeholder="https://example.com/image.png"
                    onChange={(e) => setCustomUrl(e.currentTarget.value)}
                  />
                  <button
                    className="px-3 py-1 bg-blue-500 text-white rounded-md hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:opacity-70 disabled:cursor-not-allowed"
                    onClick={applyCustomUrl}
                    disabled={!customUrl}
                    type="button"
                  >
                    {t('Apply')}
                  </button>
                </div>
              </div>
              
              {customUrl && (
                <div className="mt-4">
                  <p className="text-sm font-medium mb-2 dark:text-gray-200">{t('Preview')}:</p>
                  <div className="p-4 border dark:border-gray-600 rounded-md flex justify-center">
                    <div className="w-16 h-16 flex items-center justify-center">
                      <BotIcon iconName={customUrl} size={48} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto pr-2">
              <IconSelect
                value={currentIconValue}
                onChange={handleIconChange}
              />
            </div>
          )}
          
          <div className="flex justify-end mt-4 pt-2 border-t">
            <button
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-600 dark:text-gray-200"
              onClick={() => setIsSelectOpen(false)}
              type="button"
            >
              {t('Cancel')}
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AvatarSelect;
