import { keymap } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'
import {
  indentList,
  insertTableColumnLeft,
  insertTableColumnRight,
  insertTableRowAbove,
  insertTableRowBelow,
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
 * List continuation (Enter / Tab / Shift+Tab) is provided
 * by @codemirror/lang-markdown's built-in keymap.
 */
export const markdownKeymap = keymap.of([
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
    key: 'Mod-ArrowLeft',
    run(view: EditorView) {
      return insertTableColumnLeft(view)
    },
  },
  {
    key: 'Mod-ArrowRight',
    run(view: EditorView) {
      return insertTableColumnRight(view)
    },
  },
  {
    key: 'Mod-ArrowUp',
    run(view: EditorView) {
      return insertTableRowAbove(view)
    },
  },
  {
    key: 'Mod-ArrowDown',
    run(view: EditorView) {
      return insertTableRowBelow(view)
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
      return wrapLink(view)
    },
  },
])
