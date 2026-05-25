import type { EditorView } from '@codemirror/view'

export interface MarkdownEditorState {
  value: string
  isDirty: boolean
  isFocused: boolean
  isEmpty: boolean
  canUndo: boolean
  canRedo: boolean
  readOnly: boolean
  selection: {
    from: number
    to: number
    empty: boolean
  }
  activeLine: {
    number: number
    from: number
    to: number
    text: string
  }
  activeMarks: {
    bold: boolean
    italic: boolean
    code: boolean
    link: boolean
    headingLevel: 1 | 2 | 3 | 4 | 5 | 6 | null
    list: 'bullet' | 'ordered' | 'task' | null
    quote: boolean
  }
}

export interface SlashCommand {
  label: string
  detail?: string
  keywords?: readonly string[]
  run: (view: EditorView) => boolean
}

export interface DocumentAnnotation {
  id: string
  documentId: string
  kind: string
  anchorType: 'line' | 'range'
  startLine?: number
  endLine?: number
  from?: number
  to?: number
  label?: string
  actorType?: string
  actorId?: string
  status?: string
  className?: string
}

export interface MarkdownEditorProps {
  value: string
  onChange: (markdown: string) => void
  baselineValue?: string
  slashCommands?: boolean | readonly SlashCommand[]
  annotations?: readonly DocumentAnnotation[]
  onAnnotationClick?: (annotation: DocumentAnnotation, view: EditorView) => void
  placeholder?: string
  readOnly?: boolean
  floatingToolbar?: boolean
  autoFocus?: boolean
  minHeight?: number
  maxHeight?: number
  onSubmit?: () => void
  onImageUpload?: (file: File) => Promise<string>
  onStateChange?: (state: MarkdownEditorState) => void
  /** Called with the EditorView instance after CM6 mounts (or re-mounts). */
  onViewReady?: (view: EditorView) => void
  className?: string
}

export interface EditorToolbarProps {
  view: EditorView | null
  variant: 'full' | 'floating'
}
