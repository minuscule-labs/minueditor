import type { EditorView } from '@codemirror/view'
import type { EditorToolbarProps } from '../types'
import {
  toggleBold,
  toggleItalic,
  toggleStrikethrough,
  toggleInlineCode,
  wrapLink,
  setHeading,
  toggleUnorderedList,
  toggleOrderedList,
  toggleCheckboxList,
  insertCodeBlock,
  insertTable,
  insertHR,
  insertImage,
} from './commands'

// ── Button definitions ────────────────────────────────────────────────────────

interface ToolbarButton {
  label: string
  title: string
  run: (view: EditorView) => boolean
  group?: string
}

const FULL_TOOLBAR_BUTTONS: ToolbarButton[] = [
  // Headings
  { label: 'H1', title: 'Heading 1', run: (v) => setHeading(v, 1), group: 'heading' },
  { label: 'H2', title: 'Heading 2', run: (v) => setHeading(v, 2), group: 'heading' },
  { label: 'H3', title: 'Heading 3', run: (v) => setHeading(v, 3), group: 'heading' },
  { label: 'H4', title: 'Heading 4', run: (v) => setHeading(v, 4), group: 'heading' },
  { label: 'H5', title: 'Heading 5', run: (v) => setHeading(v, 5), group: 'heading' },
  { label: 'H6', title: 'Heading 6', run: (v) => setHeading(v, 6), group: 'heading' },
  // Inline
  { label: 'B', title: 'Bold (Cmd+B)', run: toggleBold, group: 'inline' },
  { label: 'I', title: 'Italic (Cmd+I)', run: toggleItalic, group: 'inline' },
  { label: 'S', title: 'Strikethrough', run: toggleStrikethrough, group: 'inline' },
  { label: '`', title: 'Inline code (Cmd+`)', run: toggleInlineCode, group: 'inline' },
  { label: '🔗', title: 'Link (Cmd+K)', run: wrapLink, group: 'inline' },
  // Lists
  { label: '• List', title: 'Unordered list', run: toggleUnorderedList, group: 'list' },
  { label: '1. List', title: 'Ordered list', run: toggleOrderedList, group: 'list' },
  { label: '☐ List', title: 'Checkbox list', run: toggleCheckboxList, group: 'list' },
  // Block
  { label: '</>', title: 'Code block', run: insertCodeBlock, group: 'block' },
  { label: '⊞', title: 'Insert table', run: insertTable, group: 'block' },
  { label: '—', title: 'Horizontal rule', run: insertHR, group: 'block' },
  { label: '🖼', title: 'Insert image', run: insertImage, group: 'block' },
]

// ── Full toolbar component ────────────────────────────────────────────────────

export function EditorToolbar({ view, variant }: EditorToolbarProps) {
  if (!view || variant !== 'full') return null

  function handleClick(btn: ToolbarButton) {
    if (!view) return
    btn.run(view)
    view.focus()
  }

  // Group buttons with separators
  const groups = FULL_TOOLBAR_BUTTONS.reduce<Record<string, ToolbarButton[]>>(
    (acc, btn) => {
      const g = btn.group ?? 'misc'
      if (!acc[g]) acc[g] = []
      acc[g].push(btn)
      return acc
    },
    {}
  )

  return (
    <div className="me-toolbar me-toolbar--full" role="toolbar" aria-label="Formatting">
      {Object.entries(groups).map(([group, buttons], i) => (
        <span key={group} className="me-toolbar-group">
          {i > 0 && <span className="me-toolbar-sep" aria-hidden="true" />}
          {buttons.map((btn) => (
            <button
              key={btn.label}
              type="button"
              title={btn.title}
              aria-label={btn.title}
              className="me-toolbar-btn"
              onMouseDown={(e) => {
                // Prevent editor blur
                e.preventDefault()
                handleClick(btn)
              }}
            >
              {btn.label}
            </button>
          ))}
        </span>
      ))}
    </div>
  )
}
