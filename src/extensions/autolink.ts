import { EditorView } from '@codemirror/view'

const URL_REGEX = /^https?:\/\/[^\s]+$/
const EMPTY_LIST_ITEM_REGEX = /^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX/]\]\s+)?$/

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
    if (!view.state.facet(EditorView.editable)) return false

    const getData = event.clipboardData?.getData
    const text = typeof getData === 'function' ? getData.call(event.clipboardData, 'text/plain')?.trim() : ''
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

    if (lineContent === '' || EMPTY_LIST_ITEM_REGEX.test(line.text)) {
      // Empty line/list item → insert [url](url)
      view.dispatch({
        changes: lineContent === ''
          ? {
              from: line.from,
              to: line.to,
              insert: `[${text}](${text})`,
            }
          : { from: sel.from, insert: `[${text}](${text})` },
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
