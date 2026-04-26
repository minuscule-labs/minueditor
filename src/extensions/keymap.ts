import { keymap } from '@codemirror/view'
import type { EditorView } from '@codemirror/view'
import {
  indentList,
  outdentList,
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
      return indentList(view)
    },
  },
  {
    key: 'Shift-Tab',
    run(view: EditorView) {
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
      return wrapLink(view)
    },
  },
])
