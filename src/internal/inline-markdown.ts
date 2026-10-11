import type { EditorState } from '@codemirror/state'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'

export type InlineMarkdownKind = 'bold' | 'italic' | 'strike' | 'code' | 'link'

export type SourceRange = { from: number; to: number }

export type InlineMarkdownSpan = SourceRange & {
  kind: InlineMarkdownKind
  contentFrom: number
  contentTo: number
  openFrom: number
  openTo: number
  closeFrom: number
  closeTo: number
}

type InlinePattern = {
  kind: InlineMarkdownKind
  regexp: RegExp
  openLen: number
  closeLen: number
}

const inlinePatterns: InlinePattern[] = [
  { kind: 'bold', regexp: /\*\*([^*]+)\*\*/g, openLen: 2, closeLen: 2 },
  { kind: 'italic', regexp: /(?<!\*)\*(?!\*)([^*]+)\*(?!\*)/g, openLen: 1, closeLen: 1 },
  { kind: 'strike', regexp: /~~([^~]+)~~/g, openLen: 2, closeLen: 2 },
  { kind: 'code', regexp: /(?<!`)`([^`\n]+)`(?!`)/g, openLen: 1, closeLen: 1 },
  { kind: 'link', regexp: /(?<!!)\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, openLen: 1, closeLen: 0 },
]

export function inlineMarkdownSpans(lineText: string, lineFrom: number): InlineMarkdownSpan[] {
  const spans: InlineMarkdownSpan[] = []

  for (const { kind, regexp, openLen, closeLen } of inlinePatterns) {
    regexp.lastIndex = 0
    for (const match of lineText.matchAll(regexp)) {
      if (match.index == null || !match[1]) continue

      const from = lineFrom + match.index
      const to = from + match[0].length
      const contentFrom = from + openLen
      const contentTo = closeLen > 0 ? to - closeLen : contentFrom + match[1].length

      spans.push({
        kind,
        from,
        to,
        contentFrom,
        contentTo,
        openFrom: from,
        openTo: contentFrom,
        closeFrom: contentTo,
        closeTo: to,
      })
    }
  }

  return spans.sort((a, b) => a.from - b.from || b.to - a.to)
}

const selectionMarkByNode: Readonly<Record<string, string>> = {
  StrongEmphasis: 'EmphasisMark',
  Emphasis: 'EmphasisMark',
  Strikethrough: 'StrikethroughMark',
  InlineCode: 'CodeMark',
}

type SelectionSpan = SourceRange & { boundaryTo: number }

function selectionSpan(state: EditorState, node: SyntaxNode): SelectionSpan | null {
  if (node.name === 'Link') {
    const marks = node.getChildren('LinkMark')
    const opening = marks[0]
    const closing = marks.find(mark => state.sliceDoc(mark.from, mark.to) === ']')
    // Keep reference links outside this inline abstraction, and do not expand
    // selections inside a destination URL or title as if they were link labels.
    if (!opening || !closing || !marks.some(mark => state.sliceDoc(mark.from, mark.to) === '(')) return null
    return { from: node.from, to: node.to, boundaryTo: closing.to }
  }

  const mark = selectionMarkByNode[node.name]
  if (!mark) return null
  const opening = node.firstChild
  const closing = node.lastChild
  if (!opening || !closing || opening.name !== mark || closing.name !== mark || opening.to > closing.from) return null
  return { from: node.from, to: node.to, boundaryTo: closing.to }
}

export function expandInlineMarkdownRange(state: EditorState, range: SourceRange): SourceRange {
  if (range.from === range.to) return range

  // Clipboard/mouse boundaries need parsed syntax: line regexes miss nested
  // formatting, underscores, long backtick fences, and literal code contexts.
  // Retain the existing whole-span policy when selecting formatted content.
  // Long notes may not have parsed this selection yet. Use CodeMirror's bounded
  // parsing budget, falling back to the available tree rather than regex guesses.
  const tree = ensureSyntaxTree(state, range.to) ?? syntaxTree(state)
  let { from, to } = range
  for (let node: SyntaxNode | null = tree.resolveInner(range.from, 1); node; node = node.parent) {
    const span = selectionSpan(state, node)
    if (span && from > span.from && from < span.boundaryTo) from = span.from
  }
  for (let node: SyntaxNode | null = tree.resolveInner(range.to, -1); node; node = node.parent) {
    const span = selectionSpan(state, node)
    if (span && to > span.from && to <= span.boundaryTo) to = span.to
  }

  return from === range.from && to === range.to ? range : { from, to }
}

export function hiddenInlineSuffixTarget(state: EditorState, cursor: number): number | null {
  const line = state.doc.lineAt(cursor)
  const offset = cursor - line.from

  for (const span of inlineMarkdownSpans(line.text, line.from)) {
    const localCloseFrom = span.closeFrom - line.from
    const localCloseTo = span.closeTo - line.from
    if (localCloseTo !== line.text.length) continue
    if (offset < localCloseFrom || offset >= localCloseTo) continue
    return span.closeTo
  }

  return null
}
