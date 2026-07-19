import { Switch } from '@headlessui/react'
import { cx } from '~/utils'
import { FC } from 'react'

interface Props {
  enabled: boolean
  onChange?: (enabled: boolean) => void
  disabled?: boolean
}

const Toggle: FC<Props> = (props) => {
  return (
    <Switch
      checked={props.enabled}
      onChange={props.disabled ? undefined : props.onChange}
      disabled={props.disabled}
      className={cx(
        props.enabled ? 'bg-primary-blue' : 'bg-secondary',
        props.disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
        'relative inline-flex h-4 w-7 flex-shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out',
      )}
    >
      <span
        className={cx(
          props.enabled ? 'translate-x-3' : 'translate-x-0',
          'pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out',
        )}
      />
    </Switch>
  )
}

export default Toggle
