import { FC } from 'react';
import { useTranslation } from 'react-i18next';
import ExpandableDialog from '../ExpandableDialog';
import IconSelect from './IconSelect';
import { Input } from '../Input';
import Button from '../Button';

interface IconSelectModalProps {
  open: boolean;
  onClose: () => void;
  value: string;
  onChange: (value: string) => void;
}

const IconSelectModal: FC<IconSelectModalProps> = ({ open, onClose, value, onChange }) => {
  const { t } = useTranslation();

  return (
    <ExpandableDialog
      open={open}
      onClose={onClose}
      title={t('Select Provider Icon')}
      footer={
        <div className="flex justify-end gap-2">
          <Button text={t('Cancel')} color="flat" onClick={onClose} />
          <Button text={t('OK')} color="primary" onClick={onClose} />
        </div>
      }
    >
      <div className="space-y-4 p-4">
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-2">{t('Custom Icon URL')}</label>
            <Input
              value={value}
              onChange={(e) => onChange(e.currentTarget.value)}
              placeholder="https://example.com/icon.png or leave blank to select from presets"
              className="w-full"
            />
          </div>
          <div className="text-center text-sm opacity-70">{t('Or choose from presets below:')}</div>
        </div>
        <IconSelect
          value={value}
          onChange={(val) => {
            onChange(val);
          }}
        />
      </div>
    </ExpandableDialog>
  );
};

export default IconSelectModal;