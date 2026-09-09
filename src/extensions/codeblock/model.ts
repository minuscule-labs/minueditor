import type { Extension, EditorSelection, EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { HighlightStyle, LanguageDescription, syntaxTree } from '@codemirror/language'
import { renderCodeHtml as renderStaticCodeHtml } from '../highlight'
import type { CodeHighlighter } from '../../types'
import type { FencedBlockInfo } from './types'

export type CodeBlockOptions = {
  codeLanguages: readonly LanguageDescription[]
  codeHighlighter?: CodeHighlighter | undefined
  codeHighlightStyle?: HighlightStyle | undefined
  excludedLanguages?: readonly string[] | undefined
}

export function renderCodeHtml(code: string, lang: string, highlighted: string | null): string {
  if (highlighted) return highlighted
  return renderStaticCodeHtml(code, lang)
}

type Fence = {
  indent: string
  character: '`' | '~'
  length: number
}

function openingFence(line: string): Fence | null {
  const match = line.match(/^( {0,3})(`{3,}|~{3,})(.*)$/)
  if (!match) return null

  return {
    indent: match[1],
    character: match[2][0] as Fence['character'],
    length: match[2].length,
  }
}

function isClosingFence(line: string, opening: Fence, containerPrefix: string): boolean {
  const source = containerPrefix && line.startsWith(containerPrefix)
    ? line.slice(containerPrefix.length)
    : line
  const match = source.match(/^ {0,3}(`+|~+)\s*$/)
  return Boolean(
    match &&
    match[1][0] === opening.character &&
    match[1].length >= opening.length,
  )
}

function closingFenceLine(
  state: EditorState,
  openingLine: number,
  opening: Fence,
  containerPrefix: string,
) {
  for (let number = openingLine + 1; number <= state.doc.lines; number++) {
    const line = state.doc.line(number)
    if (isClosingFence(line.text, opening, containerPrefix)) return line
  }
  return null
}

export function getFencedBlockInfo(state: EditorState, pos: number): FencedBlockInfo | null {
  const doc = state.doc
  let result: FencedBlockInfo | null = null

  syntaxTree(state).iterate({
    from: 0,
    to: doc.length,
    enter(node) {
      if (node.name !== 'FencedCode' || pos < node.from || pos > node.to) return

      const opening = doc.lineAt(node.from)
      const fenceOffset = node.from - opening.from
      const rawPrefix = opening.text.slice(0, fenceOffset)
      const containerPrefix = /^ {0,3}$/.test(rawPrefix) ? '' : rawPrefix
      const fenceIndent = containerPrefix ? '' : rawPrefix
      const fence = openingFence(opening.text.slice(fenceOffset))
      if (!fence) return
      const closingPrefix = containerPrefix.replace(
        /(?:[-+*]|\d+[.)])\s+$/,
        (marker) => " ".repeat(marker.length),
      )
      const closing = closingFenceLine(state, opening.number, fence, closingPrefix)
      const infoFrom = node.from + fence.indent.length + fence.length
      const infoSource = doc.sliceString(infoFrom, opening.to)
      const languageMatch = /\S+/.exec(infoSource)
      const languageFrom = languageMatch ? infoFrom + languageMatch.index : infoFrom
      const languageTo = languageMatch ? languageFrom + languageMatch[0].length : languageFrom
      const contentFrom = opening.to < doc.length ? opening.to + 1 : doc.length
      const contentTo = closing
        ? Math.max(contentFrom, closing.from - 1)
        : doc.length
      const blockTo = closing?.to ?? doc.length

      result = {
        blockFrom: node.from,
        blockTo,
        openingFenceFrom: node.from,
        openingFenceTo: opening.to,
        languageFrom,
        languageTo,
        closingFenceFrom: closing?.from ?? null,
        closingFenceTo: closing?.to ?? null,
        hasClosingFence: Boolean(closing),
        fenceDelimiter: fence.character.repeat(fence.length),
        indent: `${closingPrefix}${fenceIndent}${fence.indent}`,
        containerPrefix,
        contentFrom,
        contentTo,
        code: doc.sliceString(contentFrom, contentTo),
        lang: languageMatch?.[0] ?? '',
      }
      return false
    },
  })

  return result
}

export function getFencedBlockByStart(state: EditorState, blockFrom: number): FencedBlockInfo | null {
  return getFencedBlockInfo(state, blockFrom)
}

function getOffsetForLine(code: string, lineIndex: number): number {
  if (lineIndex <= 0) return 0
  let offset = 0
  let currentLine = 0
  while (currentLine < lineIndex && offset < code.length) {
    const nextBreak = code.indexOf('\n', offset)
    if (nextBreak === -1) return code.length
    offset = nextBreak + 1
    currentLine += 1
  }
  return offset
}

export function getSelectionForBlockClick(
  _view: EditorView,
  block: FencedBlockInfo,
  event: MouseEvent,
  createSelection: (anchor: number) => EditorSelection,
): EditorSelection {
  const widget = (event.target as HTMLElement | null)?.closest('.me-codeblock-widget') as HTMLElement | null
  const body = widget?.querySelector('.me-codeblock-body') as HTMLElement | null

  if (!body || block.code.length === 0) {
    return createSelection(block.contentFrom)
  }

  const rect = body.getBoundingClientRect()
  const bodyStyle = getComputedStyle(body)
  const lineHeight = Number.parseFloat(bodyStyle.lineHeight) || 22
  const relativeY = Math.max(0, event.clientY - rect.top)
  const lines = block.code.split('\n')
  const lineIndex = Math.min(lines.length - 1, Math.floor(relativeY / lineHeight))
  const offset = getOffsetForLine(block.code, lineIndex)
  return createSelection(block.contentFrom + offset)
}

export function getCodeLanguageExtension(
  codeLanguages: readonly LanguageDescription[],
  lang: string,
): Promise<Extension> {
  const normalized = lang.trim().toLowerCase()
  if (!normalized) return Promise.resolve([])

  const languages = [...codeLanguages]
  const description =
    LanguageDescription.matchLanguageName(languages, normalized, true) ??
    LanguageDescription.matchLanguageName(languages, normalized, false)
  if (!description) return Promise.resolve([])
  return description.load().catch(() => [])
}

export function getAdjacentFencedBlock(
  state: EditorState,
  pos: number,
  direction: 'up' | 'down',
): FencedBlockInfo | null {
  const doc = state.doc

  if (direction === 'down') {
    const line = doc.lineAt(pos)
    if (line.number >= doc.lines) return null
    const nextLine = doc.line(line.number + 1)
    const trimmed = nextLine.text.trim()
    if (!trimmed.startsWith('```')) return null
    return getFencedBlockInfo(state, nextLine.from)
  }

  const line = doc.lineAt(pos)
  if (line.number <= 1) return null
  const previousLine = doc.line(line.number - 1)
  if (previousLine.text.trim().startsWith('```')) {
    return getFencedBlockInfo(state, previousLine.from)
  }
  return null
}
