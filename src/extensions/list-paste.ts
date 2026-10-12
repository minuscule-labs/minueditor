import type { EditorState } from '@codemirror/state'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { markdownLanguage } from '@codemirror/lang-markdown'
import { liveListMarkerMode } from './keymap'

function firstLine(text: string): string {
  const end = text.search(/[\r\n]/)
  return end < 0 ? text : text.slice(0, end)
}

/** Identify an explicit list fragment, not a thematic break or ordinary prose. */
export function listFragmentIndent(text: string): string | null {
  const prefix = /^([ \t]*)([-*+]|\d{1,9}[.)])[ \t]+/.exec(text)
  if (!prefix) return null
  // A copied nested item can start beyond Markdown's root indentation limit.
  // Parse its first line at column zero to validate the actual marker syntax.
  const tree = markdownLanguage.parser.parse(firstLine(text).slice(prefix[1].length))
  const list = tree.topNode.firstChild
  const item = list?.firstChild
  return (list?.name === 'BulletList' || list?.name === 'OrderedList')
    && item?.name === 'ListItem' && item.getChild('ListMark')?.from === 0
    ? prefix[1] : null
}

function indentWidth(indent: string): number {
  let width = 0
  for (const char of indent) width += char === '\t' ? 4 - width % 4 : 1
  return width
}

/** Replace only an empty, parsed live list item at a single content caret. */
export function normalizeEmptyListPaste(state: EditorState, markdown: string): { from: number; to: number; insert: string } | null {
  if (!state.facet(liveListMarkerMode) || state.selection.ranges.length !== 1 || !state.selection.main.empty) return null
  const line = state.doc.lineAt(state.selection.main.head)
  const prefix = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(\[[ xX/]\])?[ \t]*$/.exec(line.text)
  if (!prefix) return null
  const from = line.from + prefix[1].length
  const contentEdge = from + prefix[2].length + (prefix[4] ? prefix[3].length + prefix[4].length : 0)
  if (state.selection.main.head < contentEdge) return null
  const tree = ensureSyntaxTree(state, line.to) ?? syntaxTree(state)
  let node = tree.resolveInner(from, 1)
  while (node.name !== 'ListItem') {
    if (node.name === 'CodeBlock' || node.name === 'FencedCode' || !node.parent) return null
    node = node.parent
  }
  // A containing item doesn't make code/HTML/continuation text a new list item.
  if (node.getChild('ListMark')?.from !== from || node.getChild('CodeBlock')) return null

  const baseIndent = listFragmentIndent(markdown)
  if (baseIndent == null) return null
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  if (lines.some(text => text.trim() && !text.startsWith(baseIndent))) return null
  const indent = prefix[1]
  // Changing tab-stop alignment can change nesting or literal code indentation.
  // Keep ambiguous tabbed fragments on the existing raw paste path instead.
  if ((indentWidth(indent) - indentWidth(baseIndent)) % 4 !== 0
    && lines.some(text => text.trim() && /^[ \t]*\t/.test(text.slice(baseIndent.length)))) return null
  const insert = lines.map((text, index) => text.trim()
    ? (index === 0 ? '' : indent) + text.slice(baseIndent.length)
    : text).join('\n')
  return { from, to: line.to, insert }
}
