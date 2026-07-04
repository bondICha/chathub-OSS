// src/app/components/Switch.tsx
import { FC } from 'react'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}

const Switch: FC<Props> = ({ checked, onChange, disabled = false }) => {
  return (
    <label className={`relative inline-flex items-center ${disabled ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        className="sr-only peer"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
      />
      <div className={`
        w-11 h-6 ${disabled ? 'bg-gray-300' : 'bg-gray-200'} rounded-full peer
        peer-checked:after:translate-x-full peer-checked:after:border-white
        after:content-[''] after:absolute after:top-[2px] after:left-[2px]
        after:bg-white after:border-gray-300 after:border after:rounded-full
        after:h-5 after:w-5 after:transition-all
        ${disabled ? 'peer-checked:bg-blue-400' : 'peer-checked:bg-blue-600'}
      `}></div>
    </label>
  )
}

export default Switch