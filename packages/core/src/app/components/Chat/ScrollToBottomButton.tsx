import { FC } from 'react'
import { ChevronDownIcon } from '@heroicons/react/24/outline'

interface Props {
  onClick: () => void;
}

const ScrollToBottomButton: FC<Props> = ({ onClick }) => {
  return (
    <button
      className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-primary-background border border-primary-border rounded-full p-2 shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-105 z-10"
      onClick={onClick}
      title="最下部へスクロール"
    >
      <ChevronDownIcon className="w-5 h-5 text-primary-text" />
    </button>
  )
}

export default ScrollToBottomButton