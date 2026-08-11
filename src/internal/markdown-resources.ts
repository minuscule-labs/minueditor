import type { EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import type { SyntaxNode } from '@lezer/common'
import type { ResourceKind } from '../types'
import { decodeMarkdownResourceDestination } from './resource-urls'

export interface ParsedMarkdownResource {
  kind: ResourceKind
  from: number
  to: number
  labelFrom: number
  labelTo: number
  label: string
  /** Full CodeMirror URL node, including optional angle brackets. */
  urlFrom: number
  urlTo: number
  /** Destination content after removing angle-bracket syntax and escapes. */
  destinationFrom: number
  destinationTo: number
  destination: string
  title?: {
    from: number
    to: number
    value: string
  }
}

const escapablePunctuation = /\\([!"#$%&'()*+,\-./:;<=>?@[\]\\^_`{|}~])/g

function unescapeMarkdownPunctuation(value: string): string {
  return value.replace(escapablePunctuation, '$1')
}

function childNodes(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = []
  for (let child = node.firstChild; child; child = child.nextSibling) {
    children.push(child)
  }
  return children
}

function parsedTitle(state: EditorState, node: SyntaxNode | undefined) {
  if (!node) return undefined
  const raw = state.sliceDoc(node.from, node.to)
  const first = raw[0]
  const last = raw[raw.length - 1]
  const wrapped =
    (first === '"' && last === '"') ||
    (first === "'" && last === "'") ||
    (first === '(' && last === ')')
  const value = wrapped ? raw.slice(1, -1) : raw
  return {
    from: node.from,
    to: node.to,
    value: decodeMarkdownResourceDestination(unescapeMarkdownPunctuation(value)),
  }
}

function parseResourceNode(
  state: EditorState,
  node: SyntaxNode,
): ParsedMarkdownResource | null {
  if (node.name !== 'Link' && node.name !== 'Image') return null

  const children = childNodes(node)
  // Labels may themselves be parsed as URL nodes (for [url](url)). The
  // destination is the final direct URL child, after the opening parenthesis.
  const urlNodes = children.filter((child) => child.name === 'URL')
  const urlNode = urlNodes[urlNodes.length - 1]
  if (!urlNode) return null

  const marksBeforeUrl = children.filter(
    (child) => child.name === 'LinkMark' && child.to <= urlNode.from,
  )
  const openingLabelMark = marksBeforeUrl[0]
  const closingLabelMark = marksBeforeUrl.find(
    (mark) => state.sliceDoc(mark.from, mark.to) === ']',
  )
  if (!openingLabelMark || !closingLabelMark) return null

  const rawDestination = state.sliceDoc(urlNode.from, urlNode.to)
  const angleWrapped = rawDestination.startsWith('<') && rawDestination.endsWith('>')
  const destinationFrom = urlNode.from + (angleWrapped ? 1 : 0)
  const destinationTo = urlNode.to - (angleWrapped ? 1 : 0)
  const destination = decodeMarkdownResourceDestination(
    unescapeMarkdownPunctuation(state.sliceDoc(destinationFrom, destinationTo)),
  )
  const title = parsedTitle(
    state,
    children.find((child) => child.name === 'LinkTitle'),
  )

  return {
    kind: node.name === 'Image' ? 'image' : 'link',
    from: node.from,
    to: node.to,
    labelFrom: openingLabelMark.to,
    labelTo: closingLabelMark.from,
    label: state.sliceDoc(openingLabelMark.to, closingLabelMark.from),
    urlFrom: urlNode.from,
    urlTo: urlNode.to,
    destinationFrom,
    destinationTo,
    destination,
    ...(title ? { title } : {}),
  }
}

export function markdownResources(
  state: EditorState,
  from = 0,
  to = state.doc.length,
): ParsedMarkdownResource[] {
  const resources: ParsedMarkdownResource[] = []

  syntaxTree(state).iterate({
    from,
    to,
    enter(ref) {
      if (ref.name !== 'Link' && ref.name !== 'Image') return
      const resource = parseResourceNode(state, ref.node)
      if (resource) resources.push(resource)
      return false
    },
  })

  return resources
}

export function markdownResourceAt(
  state: EditorState,
  position: number,
  kind?: ResourceKind,
): ParsedMarkdownResource | null {
  const safePosition = Math.max(0, Math.min(position, state.doc.length))
  const line = state.doc.lineAt(safePosition)
  return markdownResources(state, line.from, line.to).find((resource) =>
    (!kind || resource.kind === kind) &&
    safePosition >= resource.from &&
    safePosition <= resource.to
  ) ?? null
}
