import { keymap } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'
import { openExternalLinkEditor } from './link-widget'
import {
  deleteMarkdownListMarker,
  indentList,
  moveCursorOutOfInlineCode,
  outdentList,
  shiftTabInMarkdownTable,
  tabInMarkdownTable,
  toggleBold,
  toggleItalic,
  toggleInlineCode,
  wrapLink,
} from '../toolbar/commands'

/**
 * Core markdown keyboard shortcuts.
 *
 * Cmd+Enter is handled separately in MarkdownEditor.tsx
 * since it depends on the `onSubmit` prop.
 *
 * Tab / Shift+Tab list indentation is handled here.
 * Enter behavior is installed by MarkdownEditor because it composes
 * table, list, and hidden-inline-suffix commands.
 */
export const markdownKeymap = keymap.of([
  {
    key: 'Backspace',
    run(view: EditorView) {
      return deleteMarkdownListMarker(view)
    },
  },
  {
    key: 'ArrowLeft',
    run(view: EditorView) {
      return moveCursorOutOfInlineCode(view, 'left')
    },
  },
  {
    key: 'ArrowRight',
    run(view: EditorView) {
      return moveCursorOutOfInlineCode(view, 'right')
    },
  },
  {
    key: 'Tab',
    run(view: EditorView) {
      if (tabInMarkdownTable(view)) return true
      return indentList(view)
    },
  },
  {
    key: 'Shift-Tab',
    run(view: EditorView) {
      if (shiftTabInMarkdownTable(view)) return true
      return outdentList(view)
    },
  },
  {
    key: 'Mod-b',
    run(view: EditorView) {
      return toggleBold(view)
    },
  },
  {
    key: 'Mod-i',
    run(view: EditorView) {
      return toggleItalic(view)
    },
  },
  {
    key: 'Mod-`',
    run(view: EditorView) {
      return toggleInlineCode(view)
    },
  },
  {
    key: 'Mod-k',
    run(view: EditorView) {
      return openExternalLinkEditor(view) || wrapLink(view)
    },
  },
])
