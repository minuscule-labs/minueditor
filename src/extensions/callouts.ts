import { syntaxTree } from '@codemirror/language'
import { type EditorState, RangeSet, type Range } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'

export const calloutTypes = ['note', 'tip', 'important', 'warning', 'caution'] as const
export type CalloutType = (typeof calloutTypes)[number]

export type CalloutBlock = {
  type: CalloutType
  from: number
  to: number
  markerFrom: number
  markerTo: number
  startLine: number
  endLine: number
}

const calloutTypeSet = new Set<string>(calloutTypes)

export const calloutLabels: Readonly<Record<CalloutType, string>> = {
  note: 'Note',
  tip: 'Tip',
  important: 'Important',
  warning: 'Warning',
  caution: 'Caution',
}

function parseCalloutMarker(line: string): { type: CalloutType; from: number; to: number } | null {
  const match = /^(\s*>\s*)\[!([A-Za-z]+)\]\s*$/.exec(line)
  if (!match) return null

  const type = match[2].toLowerCase()
  if (!calloutTypeSet.has(type)) return null

  const markerFrom = match[1].length
  return {
    type: type as CalloutType,
    from: markerFrom,
    to: markerFrom + match[0].slice(markerFrom).trim().length,
  }
}

export function findCalloutBlocks(state: EditorState): CalloutBlock[] {
  const blocks: CalloutBlock[] = []

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'Blockquote') return

      const firstLine = state.doc.lineAt(node.from)
      const marker = parseCalloutMarker(firstLine.text)
      if (!marker) return

      blocks.push({
        type: marker.type,
        from: node.from,
        to: node.to,
        markerFrom: firstLine.from + marker.from,
        markerTo: firstLine.from + marker.to,
        startLine: firstLine.number,
        endLine: state.doc.lineAt(node.to).number,
      })
    },
  })

  return blocks
}

class CalloutLabelWidget extends WidgetType {
  constructor(readonly type: CalloutType) {
    super()
  }

  override eq(other: CalloutLabelWidget): boolean {
    return this.type === other.type
  }

  override toDOM(): HTMLElement {
    const label = document.createElement('span')
    label.className = `me-callout-label me-callout-label--${this.type}`
    label.textContent = calloutLabels[this.type]
    return label
  }

  override ignoreEvent(): boolean {
    return true
  }
}

function activeLines(view: EditorView): Set<number> {
  const lines = new Set<number>()
  if (!view.hasFocus) return lines

  for (const range of view.state.selection.ranges) {
    const start = view.state.doc.lineAt(range.from).number
    const end = view.state.doc.lineAt(range.to).number
    for (let line = start; line <= end; line += 1) lines.add(line)
  }

  return lines
}

function buildCalloutDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const active = activeLines(view)

  for (const block of findCalloutBlocks(view.state)) {
    for (let lineNumber = block.startLine; lineNumber <= block.endLine; lineNumber += 1) {
      const line = view.state.doc.line(lineNumber)
      const position = lineNumber - block.startLine
      const lastPosition = block.endLine - block.startLine
      const edgeClasses = [
        position === 0 ? 'me-callout-line--first' : '',
        position === lastPosition ? 'me-callout-line--last' : '',
      ].filter(Boolean).join(' ')
      ranges.push(
        Decoration.line({
          class: `me-callout-line me-callout-line--${block.type}${edgeClasses ? ` ${edgeClasses}` : ''}`,
        }).range(line.from),
      )
    }

    if (!active.has(block.startLine)) {
      ranges.push(
        Decoration.replace({
          widget: new CalloutLabelWidget(block.type),
        }).range(block.markerFrom, block.markerTo),
      )
    }
  }

  return RangeSet.of(ranges, true)
}

export const calloutDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildCalloutDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.focusChanged || update.viewportChanged) {
        this.decorations = buildCalloutDecorations(update.view)
      }
    }
  },
  { decorations: (instance) => instance.decorations },
)

function rendererCalloutMarker(blockquote: HTMLElement): { type: CalloutType; markerNode: Text } | null {
  const firstParagraph = blockquote.firstElementChild
  if (!(firstParagraph instanceof HTMLParagraphElement)) return null

  const markerNode = firstParagraph.firstChild
  if (!(markerNode instanceof Text)) return null

  const match = /^\[!([A-Za-z]+)\](?:\n|\s*$)/.exec(markerNode.data)
  if (!match) return null

  const type = match[1].toLowerCase()
  if (!calloutTypeSet.has(type)) return null

  markerNode.data = markerNode.data.slice(match[0].length)
  if (!firstParagraph.textContent?.trim()) firstParagraph.remove()
  return { type: type as CalloutType, markerNode }
}

/** Enhance portable GitHub alert blockquotes in static renderer output. */
export function enhanceRendererCallouts(container: HTMLElement): void {
  for (const blockquote of container.querySelectorAll<HTMLElement>('blockquote')) {
    if (blockquote.classList.contains('me-callout')) continue
    const callout = rendererCalloutMarker(blockquote)
    if (!callout) continue

    blockquote.classList.add('me-callout', `me-callout--${callout.type}`)
    blockquote.dataset.calloutType = callout.type
    blockquote.setAttribute('aria-label', calloutLabels[callout.type])

    const title = document.createElement('div')
    title.className = `me-callout-title me-callout-title--${callout.type}`
    title.textContent = calloutLabels[callout.type]
    blockquote.prepend(title)
  }
}
