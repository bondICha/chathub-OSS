import PromptLibrary from './Library'
import ExpandableDialog from '../ExpandableDialog'

interface Props {
  isOpen: boolean
  onClose: () => void
  insertPrompt: (text: string) => void
}

const PromptLibraryDialog = (props: Props) => {
  return (
    <ExpandableDialog title="Prompt Library" open={props.isOpen} onClose={props.onClose} size="lg">
      <div className="flex-1 min-h-0 overflow-auto p-5">
        <div className="min-h-[400px]">
          <PromptLibrary insertPrompt={props.insertPrompt} />
        </div>
      </div>
    </ExpandableDialog>
  )
}

export default PromptLibraryDialog
