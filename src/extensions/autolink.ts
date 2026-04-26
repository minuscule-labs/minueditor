import { EditorView } from '@codemirror/view'
import type { Transaction } from '@codemirror/state'

const URL_REGEX = /^https?:\/\/[^\s]+$/

/**
 * Intercepts paste events. When a plain-text URL is pasted:
 * - Selected text → wrap as `[selected text](url)`
 * - Empty line, nothing selected → insert `[url](url)`
 * - Mid-line, nothing selected → insert the raw URL
 *
 * HTTP and HTTPS only. No DNS lookup.
 */
export const autolinkPaste = EditorView.domEventHandlers({
  paste(event, view) {
    const text = event.clipboardData?.getData('text/plain')?.trim()
    if (!text || !URL_REGEX.test(text)) return false

    event.preventDefault()

    const state = view.state
    const sel = state.selection.main

    // Case 1: text is selected → wrap as markdown link
    if (!sel.empty) {
      const selectedText = state.doc.sliceString(sel.from, sel.to)
      view.dispatch({
        changes: {
          from: sel.from,
          to: sel.to,
          insert: `[${selectedText}](${text})`,
        },
        selection: { anchor: sel.from + selectedText.length + text.length + 4 },
      })
      return true
    }

    // Case 2: nothing selected — check if we're on an otherwise empty line
    const line = state.doc.lineAt(sel.from)
    const lineContent = line.text.trim()

    if (lineContent === '') {
      // Empty line → insert [url](url)
      view.dispatch({
        changes: {
          from: line.from,
          to: line.to,
          insert: `[${text}](${text})`,
        },
      })
    } else {
      // Mid-line → raw URL
      view.dispatch({
        changes: { from: sel.from, insert: text },
        selection: { anchor: sel.from + text.length },
      })
    }

    return true
  },
})

/**
 * Transaction filter that can be composed if paste interception
 * needs to be done at the state level instead of DOM event level.
 * Currently unused — autolinkPaste handles everything via domEventHandlers.
 */
export function autolinkTransactionFilter(tr: Transaction): Transaction {
  return tr
}
