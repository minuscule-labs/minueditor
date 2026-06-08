import { EditorView } from '@codemirror/view'

const MARKDOWN_LINK_REGEX = /(?<!!)\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g

function linkAtPosition(lineText: string, lineFrom: number, pos: number): string | null {
  MARKDOWN_LINK_REGEX.lastIndex = 0

  for (const match of lineText.matchAll(MARKDOWN_LINK_REGEX)) {
    if (match.index == null) continue
    const label = match[1]
    const href = match[2]
    if (!label || !href) continue

    const from = lineFrom + match.index
    const to = from + match[0].length
    if (pos >= from && pos <= to) return href
  }

  return null
}

export const linkClickNavigation = EditorView.domEventHandlers({
  click(event, view) {
    if ((!event.metaKey && !event.ctrlKey) || event.altKey || event.shiftKey) return false

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (pos == null) return false

    const line = view.state.doc.lineAt(pos)
    const href = linkAtPosition(line.text, line.from, pos)
    if (!href) return false

    event.preventDefault()
    window.open(href, '_blank', 'noopener,noreferrer')
    return true
  },
})
