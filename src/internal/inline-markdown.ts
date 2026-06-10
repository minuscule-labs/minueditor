import type { EditorState } from '@codemirror/state'

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

export function expandInlineMarkdownRange(state: EditorState, range: SourceRange): SourceRange {
  if (range.from === range.to) return range

  const fromLine = state.doc.lineAt(range.from)
  const toLine = state.doc.lineAt(range.to)
  let expanded = range

  for (const span of inlineMarkdownSpans(fromLine.text, fromLine.from)) {
    if (expanded.from >= span.contentFrom && expanded.from <= span.contentTo) {
      expanded = { ...expanded, from: span.from }
      break
    }
  }

  for (const span of inlineMarkdownSpans(toLine.text, toLine.from)) {
    if (expanded.to >= span.contentFrom && expanded.to <= span.contentTo) {
      expanded = { ...expanded, to: span.to }
      break
    }
  }

  return expanded
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
