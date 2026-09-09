import { EditorView, keymap } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'
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
function hasListItemAncestor(view: EditorView): boolean {
  let node = syntaxTree(view.state).resolveInner(view.state.selection.main.from, -1)
  for (;;) {
    if (node.name === 'ListItem') return true
    if (!node.parent) return false
    node = node.parent
  }
}

export const markdownKeymap = keymap.of([
  {
    key: 'Backspace',
    run(view: EditorView) {
      return view.state.facet(EditorView.editable) &&
        hasListItemAncestor(view) &&
        deleteMarkdownListMarker(view)
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
      if (!view.state.facet(EditorView.editable)) return false
      if (tabInMarkdownTable(view)) return true
      return hasListItemAncestor(view) && indentList(view)
    },
  },
  {
    key: 'Shift-Tab',
    run(view: EditorView) {
      if (!view.state.facet(EditorView.editable)) return false
      if (shiftTabInMarkdownTable(view)) return true
      return hasListItemAncestor(view) && outdentList(view)
    },
  },
  {
    key: 'Mod-b',
    run(view: EditorView) {
      return view.state.facet(EditorView.editable) && toggleBold(view)
    },
  },
  {
    key: 'Mod-i',
    run(view: EditorView) {
      return view.state.facet(EditorView.editable) && toggleItalic(view)
    },
  },
  {
    key: 'Mod-`',
    run(view: EditorView) {
      return view.state.facet(EditorView.editable) && toggleInlineCode(view)
    },
  },
  {
    key: 'Mod-k',
    run(view: EditorView) {
      return view.state.facet(EditorView.editable) &&
        (openExternalLinkEditor(view) || wrapLink(view))
    },
  },
])
