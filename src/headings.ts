import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxTree } from '@codemirror/language'
import { EditorState, type Text } from '@codemirror/state'
import type { SyntaxNode } from '@lezer/common'

export type MarkdownHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6

export interface MarkdownHeading {
  level: MarkdownHeadingLevel
  /** Plain display text with common inline Markdown markers removed. */
  text: string
  /** Range of the complete heading, including heading markers. */
  from: number
  to: number
  /** Range containing the authored heading content. */
  contentFrom: number
  contentTo: number
  /** Deterministic, duplicate-aware document anchor. */
  slug: string
}

const headingLevels: Readonly<Record<string, MarkdownHeadingLevel>> = {
  ATXHeading1: 1,
  ATXHeading2: 2,
  ATXHeading3: 3,
  ATXHeading4: 4,
  ATXHeading5: 5,
  ATXHeading6: 6,
  SetextHeading1: 1,
  SetextHeading2: 2,
}

const hiddenInlineMarks = new Set([
  'CodeMark',
  'EmphasisMark',
  'LinkMark',
  'StrikethroughMark',
])

type SourceRange = { from: number; to: number }

function headingContentRange(node: SyntaxNode, doc: Text): SourceRange {
  if (node.name.startsWith('SetextHeading')) {
    const firstLine = doc.lineAt(node.from)
    return { from: node.from, to: Math.min(firstLine.to, node.to) }
  }

  let from = node.from
  let to = node.to
  const first = node.firstChild
  const last = node.lastChild

  if (first?.name === 'HeaderMark') from = first.to
  if (last?.name === 'HeaderMark' && last.from > (first?.to ?? node.from)) to = last.from

  const authored = doc.sliceString(from, to)
  const leadingWhitespace = authored.length - authored.trimStart().length
  const trailingWhitespace = authored.length - authored.trimEnd().length
  return {
    from: from + leadingWhitespace,
    to: Math.max(from + leadingWhitespace, to - trailingWhitespace),
  }
}

function hiddenRanges(node: SyntaxNode, content: SourceRange): SourceRange[] {
  const ranges: SourceRange[] = []
  const cursor = node.cursor()

  if (!cursor.firstChild()) return ranges

  do {
    const current = cursor.node
    const parentName = current.parent?.name
    if (
      hiddenInlineMarks.has(current.name) ||
      (current.name === 'URL' && (parentName === 'Link' || parentName === 'Image'))
    ) {
      if (current.from >= content.from && current.to <= content.to) {
        ranges.push({ from: current.from, to: current.to })
      }
    }
  } while (cursor.next())

  return ranges.sort((a, b) => a.from - b.from)
}

function visibleHeadingText(node: SyntaxNode, doc: Text, content: SourceRange): string {
  const ranges = hiddenRanges(node, content)
  let text = ''
  let position = content.from

  for (const range of ranges) {
    if (range.from < position) continue
    text += doc.sliceString(position, range.from)
    position = range.to
  }

  text += doc.sliceString(position, content.to)
  return text
    .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Generate the base anchor used before duplicate disambiguation. */
export function slugifyMarkdownHeading(text: string): string {
  const slug = text
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/[^\p{Letter}\p{Number}\p{Mark}\s_-]/gu, '')
    .replace(/\s+/g, '-')

  return slug || 'section'
}

/** Enumerate headings from the configured CodeMirror Markdown syntax tree. */
export function getMarkdownHeadings(state: EditorState): MarkdownHeading[] {
  const headings: MarkdownHeading[] = []
  const usedSlugs = new Set<string>()
  const nextSuffix = new Map<string, number>()

  syntaxTree(state).iterate({
    enter(ref) {
      const level = headingLevels[ref.name]
      if (!level) return

      const content = headingContentRange(ref.node, state.doc)
      const text = visibleHeadingText(ref.node, state.doc, content)
      const baseSlug = slugifyMarkdownHeading(text)
      let slug = baseSlug
      let suffix = nextSuffix.get(baseSlug) ?? 1
      while (usedSlugs.has(slug)) {
        slug = `${baseSlug}-${suffix}`
        suffix += 1
      }
      usedSlugs.add(slug)
      nextSuffix.set(baseSlug, suffix)

      headings.push({
        level,
        text,
        from: ref.from,
        to: ref.to,
        contentFrom: content.from,
        contentTo: content.to,
        slug,
      })
    },
  })

  return headings
}

/** Parse headings without mounting an editor, useful for host outline UIs. */
export function parseMarkdownHeadings(value: string): MarkdownHeading[] {
  const state = EditorState.create({
    doc: value,
    extensions: [markdown({ base: markdownLanguage })],
  })
  return getMarkdownHeadings(state)
}
