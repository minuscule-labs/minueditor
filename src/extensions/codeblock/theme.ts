import { EditorView } from '@codemirror/view'

export const nestedEditorTheme = EditorView.theme({
  '&': {
    backgroundColor: 'transparent',
  },
  '.cm-editor': {
    backgroundColor: 'transparent',
  },
  '.cm-scroller': {
    fontFamily: 'inherit',
    lineHeight: '1.6',
    overflowX: 'auto',
    minHeight: '0',
    height: 'auto',
  },
  '.cm-content': {
    fontFamily: 'inherit',
    fontSize: 'inherit',
    padding: '0',
    minHeight: '0',
  },
  '.cm-line': {
    padding: '0',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'transparent',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--me-text, #1a1a1a)',
  },
  '.cm-selectionBackground, ::selection': {
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
  },
})
