import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { insertNewlineContinueMarkup } from '@codemirror/lang-markdown'
import { EditorSelection } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { SyntaxNode } from '@lezer/common'
import { calloutDecorations, findCalloutBlocks } from './callouts'

const closingMarks = new Set(['EmphasisMark', 'StrikethroughMark', 'CodeMark'])

function suffixTarget(node: SyntaxNode, cursor: number, lineEnd: number): number | null {
  let target = cursor
  for (let current: SyntaxNode | null = node; current; current = current.parent) {
    if (current.name === 'Link') {
      const marks = current.getChildren('LinkMark')
      const labelEnd = marks[1]
      // Inline links hide the destination as well as the closing bracket. Only
      // the visible label boundary qualifies, not an intentional URL edit.
      if (labelEnd && target === labelEnd.from && marks.length >= 4) target = current.to
    }
    const closing = current.lastChild
    if (closing && closingMarks.has(closing.name) && target >= closing.from && target <= closing.to) {
      target = closing.to
    }
  }
  // Advance only through a contiguous chain of closing markers at the line end.
  // Text elsewhere on the line must keep Markdown's normal split behavior.
  return target > cursor && target === lineEnd ? target : null
}

/** Narrow live-mode overrides; ordinary quotes, source mode, and lists stay native. */
export function enterInCallout(view: EditorView, keepBlankLine = false): boolean {
  const { state } = view
  const selection = state.selection.main
  if (
    !state.facet(EditorView.editable) ||
    !view.plugin(calloutDecorations) ||
    state.selection.ranges.length !== 1 ||
    !selection.empty
  ) return false

  const line = state.doc.lineAt(selection.head)
  const tree = ensureSyntaxTree(state, line.to) ?? syntaxTree(state)
  const node = tree.resolveInner(selection.head, -1)
  let quotes = 0
  let inList = false
  for (let current: SyntaxNode | null = node; current; current = current.parent) {
    if (current.name === 'FencedCode' || current.name === 'CodeBlock' || current.name === 'HTMLBlock') return false
    if (current.name === 'ListItem') inList = true
    if (current.name === 'Blockquote') quotes += 1
  }
  if (!quotes || !findCalloutBlocks(state, tree).some(block => selection.head >= block.from && selection.head <= block.to)) return false

  const target = suffixTarget(node, selection.head, line.to)
  const prefix = /^([ \t]*>)[ \t]?/.exec(line.text)
  if (keepBlankLine) {
    // Shift+Enter explicitly retains an empty quoted line. Do not steal the
    // native soft-newline behavior of nested quotes, lists, or raw quote markers.
    if (inList || quotes !== 1 || !prefix || selection.head <= line.from + line.text.indexOf('>')) return false
    const insert = `\n${prefix[1]} `
    const from = target ?? selection.head
    view.dispatch({
      changes: { from, insert },
      selection: EditorSelection.cursor(from + insert.length),
      scrollIntoView: true,
      userEvent: 'input',
    })
    return true
  }

  if (!inList && quotes === 1 && /^[ \t]*>[ \t]*$/.test(line.text) && selection.head > line.from + line.text.indexOf('>')) {
    // A separating blank line is essential: otherwise subsequent unquoted
    // prose is parsed as a lazy continuation of the callout's last paragraph.
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: '\n' },
      selection: EditorSelection.cursor(line.from + 1),
      scrollIntoView: true,
      userEvent: 'input',
    })
    return true
  }

  if (target === null) return false
  // Let Markdown own quote/list continuation, but place the logical caret after
  // hidden closing markers first. Apply both steps as one original-state edit
  // so focus, controlled updates, and undo never observe an intermediate caret.
  const continuationState = state.update({ selection: EditorSelection.cursor(target) }).state
  return insertNewlineContinueMarkup({
    state: continuationState,
    dispatch(transaction) {
      view.dispatch({
        changes: transaction.changes,
        selection: transaction.state.selection,
        scrollIntoView: true,
        userEvent: 'input',
      })
    },
  })
}
