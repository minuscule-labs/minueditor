import type { EditorView } from '@codemirror/view'

export interface MarkdownEditorProps {
  value: string
  onChange: (markdown: string) => void
  placeholder?: string
  readOnly?: boolean
  floatingToolbar?: boolean
  autoFocus?: boolean
  minHeight?: number
  maxHeight?: number
  onSubmit?: () => void
  onImageUpload?: (file: File) => Promise<string>
  /** Called with the EditorView instance after CM6 mounts (or re-mounts). */
  onViewReady?: (view: EditorView) => void
  className?: string
}

export interface EditorToolbarProps {
  view: EditorView | null
  variant: 'full' | 'floating'
}
