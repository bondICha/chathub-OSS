import { cx } from '~/utils'
import { FC, PropsWithChildren } from 'react'

interface Props {
  color: 'primary' | 'flat'
  className?: string
}

const MessageBubble: FC<PropsWithChildren<Props>> = (props) => {
  return (
    <div
      className={cx(
        'rounded-[15px] px-3 py-2 w-full',
        props.color === 'primary' ? 'bg-primary-blue text-white' : 'bg-secondary text-primary-text',
        props.className,
      )}
    >
      {props.children}
    </div>
  )
}

export default MessageBubble
