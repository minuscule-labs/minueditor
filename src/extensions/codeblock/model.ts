import type { Extension, EditorSelection, EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { LanguageDescription, syntaxTree } from '@codemirror/language'
import { renderCodeHtml as renderStaticCodeHtml } from '../highlight'
import type { CodeHighlighter } from '../../types'
import type { FencedBlockInfo } from './types'

let configuredCodeLanguages: readonly LanguageDescription[] = []
let configuredCodeHighlighter: CodeHighlighter | undefined
const languageExtensionCache = new Map<string, Promise<Extension>>()

export function setCodeBlockOptions(options: {
  codeLanguages?: readonly LanguageDescription[]
  codeHighlighter?: CodeHighlighter | undefined
}): void {
  configuredCodeLanguages = options.codeLanguages ?? []
  configuredCodeHighlighter = options.codeHighlighter
  languageExtensionCache.clear()
}

export function getCodeHighlighter(): CodeHighlighter | undefined {
  return configuredCodeHighlighter
}

export function renderCodeHtml(code: string, lang: string, highlighted: string | null): string {
  if (highlighted) return highlighted
  return renderStaticCodeHtml(code, lang)
}

export function getFencedBlockInfo(state: EditorState, pos: number): FencedBlockInfo | null {
  const doc = state.doc
  let result: FencedBlockInfo | null = null

  syntaxTree(state).iterate({
    from: 0,
    to: doc.length,
    enter(node) {
      if (node.name !== 'FencedCode') return
      if (pos < node.from || pos > node.to) return

      const blockFrom = node.from
      const blockTo = node.to
      const blockFromLine = doc.lineAt(blockFrom).number
      const blockToLine = doc.lineAt(blockTo).number
      const openingFence = doc.line(blockFromLine)
      const contentFrom =
        blockFromLine < blockToLine ? doc.line(blockFromLine + 1).from : blockFrom
      const contentTo =
        blockFromLine < blockToLine ? doc.line(blockToLine).from - 1 : blockFrom
      const code = doc.sliceString(contentFrom, contentTo)
      const fenceLine = doc.lineAt(blockFrom).text
      const langMatch = fenceLine.match(/^```(\w*)/)
      const lang = langMatch?.[1] ?? ''

      result = {
        blockFrom,
        blockTo,
        openingFenceFrom: openingFence.from,
        openingFenceTo: openingFence.to,
        contentFrom,
        contentTo,
        code,
        lang,
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

export function getCodeLanguageExtension(lang: string): Promise<Extension> {
  const normalized = lang.trim().toLowerCase()
  if (!normalized) return Promise.resolve([])

  const cached = languageExtensionCache.get(normalized)
  if (cached) return cached

  const promise = (async () => {
    const languages = [...configuredCodeLanguages]
    const description =
      LanguageDescription.matchLanguageName(languages, normalized, true) ??
      LanguageDescription.matchLanguageName(languages, normalized, false)
    if (!description) return []
    try {
      return await description.load()
    } catch {
      return []
    }
  })()

  languageExtensionCache.set(normalized, promise)
  return promise
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
