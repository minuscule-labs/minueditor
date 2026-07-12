import { EditorView } from '@codemirror/view'

const URL_REGEX = /^https?:\/\/[^\s]+$/
const EMPTY_LIST_ITEM_REGEX = /^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX/]\]\s+)?$/

/**
 * Intercepts paste events. When a plain-text URL is pasted:
 * - Selected text → wrap as `[selected text](url)`
 * - No selection → insert `[url](url)` so pasted links render consistently,
 *   including mid-line / after existing text.
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
        // Keep the cursor at the visual end of the editable label, not in
        // the hidden markdown URL suffix.
        selection: { anchor: sel.from + 1 + selectedText.length },
      })
      return true
    }

    // Case 2: nothing selected — check if we're on an otherwise empty line
    const line = state.doc.lineAt(sel.from)
    const lineContent = line.text.trim()

    if (lineContent === '' || EMPTY_LIST_ITEM_REGEX.test(line.text)) {
      // Empty line/list item → insert [url](url)
      const insert = `[${text}](${text})`
      const insertFrom = lineContent === '' ? line.from : sel.from
      view.dispatch({
        changes: lineContent === ''
          ? {
              from: line.from,
              to: line.to,
              insert,
            }
          : { from: sel.from, insert },
        // Keep the cursor at the visual end of the editable label, not in
        // the hidden markdown URL suffix.
        selection: { anchor: insertFrom + 1 + text.length },
      })
    } else {
      // Mid-line → keep pasted URLs renderable as standard markdown links.
      const insert = `[${text}](${text})`
      view.dispatch({
        changes: { from: sel.from, insert },
        // Keep the cursor at the visual end of the editable label, not in
        // the hidden markdown URL suffix.
        selection: { anchor: sel.from + 1 + text.length },
      })
    }

    return true
  },
})
