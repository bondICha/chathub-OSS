import { FC } from 'react'

interface AudioWaveIconProps {
  size?: number
  className?: string
}

const AudioWaveIcon: FC<AudioWaveIconProps> = ({ size = 20, className }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* 中央の強いビート */}
      <rect x="9.2" y="1" width="1.8" height="18" rx="0.9" fill="currentColor" />

      {/* 左側 - 上下に揺れる */}
      <rect x="7" y="4" width="1.5" height="12" rx="0.75" fill="currentColor" />
      <rect x="5.2" y="6.5" width="1.2" height="7" rx="0.6" fill="currentColor" />
      <rect x="3" y="5" width="1.4" height="10" rx="0.7" fill="currentColor" />
      <rect x="1.2" y="7.5" width="1" height="5" rx="0.5" fill="currentColor" />

      {/* 右側 - 左と異なるリズム */}
      <rect x="11.5" y="3.5" width="1.5" height="13" rx="0.75" fill="currentColor" />
      <rect x="13.6" y="7" width="1.3" height="6" rx="0.65" fill="currentColor" />
      <rect x="15.5" y="5.5" width="1.2" height="9" rx="0.6" fill="currentColor" />
      <rect x="17.5" y="8" width="1.2" height="4" rx="0.6" fill="currentColor" />
    </svg>
  )
}

export default AudioWaveIcon
