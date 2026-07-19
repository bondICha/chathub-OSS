import * as ReactTooltip from '@radix-ui/react-tooltip'
import { FC, PropsWithChildren, ReactNode } from 'react'

interface Props {
  content: ReactNode
  align?: ReactTooltip.TooltipContentProps['align']
}

const Tooltip: FC<PropsWithChildren<Props>> = (props) => {
  return (
    <ReactTooltip.Provider delayDuration={1}>
      <ReactTooltip.Root>
        <ReactTooltip.Trigger asChild>{props.children}</ReactTooltip.Trigger>
        <ReactTooltip.Portal>
          <ReactTooltip.Content
            className="data-[state=delayed-open]:data-[side=top]:animate-slideDownAndFade data-[state=delayed-open]:data-[side=right]:animate-slideLeftAndFade data-[state=delayed-open]:data-[side=left]:animate-slideRightAndFade data-[state=delayed-open]:data-[side=bottom]:animate-slideUpAndFade select-none rounded-md bg-black text-white bg-opacity-90 px-[14px] py-2.5 text-base leading-relaxed whitespace-pre-line shadow-[hsl(206_22%_7%_/_35%)_0px_10px_38px_-10px,_hsl(206_22%_7%_/_20%)_0px_10px_20px_-15px] will-change-[transform,opacity] z-50"
            sideOffset={5}
            align={props.align}
          >
            {typeof props.content === 'string' && props.content.includes('\n') ? (
              <div className="whitespace-pre-line">{props.content}</div>
            ) : (
              props.content
            )}
          </ReactTooltip.Content>
        </ReactTooltip.Portal>
      </ReactTooltip.Root>
    </ReactTooltip.Provider>
  )
}

export default Tooltip
