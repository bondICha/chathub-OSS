import React, { FC } from 'react';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
}

const Checkbox: FC<Props> = ({ checked, onChange, label, id, disabled, className }) => {
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!disabled) {
      onChange(event.target.checked);
    }
  };

  return (
    <label htmlFor={id} className={`flex items-center ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${className || ''}`}>
      <input
        id={id}
        type="checkbox"
        className="form-checkbox h-5 w-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 disabled:opacity-50"
        checked={checked}
        onChange={handleChange}
        disabled={disabled}
      />
      {label && <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{label}</span>}
    </label>
  );
};

export default Checkbox;