import { RangeSet, type Range } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import type { EditorComment } from '../types'

function validAnchor(comment: EditorComment, docLength: number): boolean {
  const { from, to, detached } = comment.anchor
  return !detached && from >= 0 && to > from && to <= docLength
}

function appendCommentIcon(button: HTMLButtonElement): void {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('viewBox', '0 0 20 20')
  icon.setAttribute('aria-hidden', 'true')
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M4 3.5h12a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 16 13.5H9l-4.5 3v-3H4A1.5 1.5 0 0 1 2.5 12V5A1.5 1.5 0 0 1 4 3.5Z')
  icon.appendChild(path)
  button.appendChild(icon)
}

class CommentBadgeWidget extends WidgetType {
  constructor(
    readonly comments: readonly EditorComment[],
    readonly onSelect: (comment: EditorComment) => void,
    readonly onSelectGroup: (comments: readonly EditorComment[]) => void,
    readonly onCreateLine?: (() => void) | undefined,
  ) {
    super()
  }

  override eq(other: CommentBadgeWidget): boolean {
    return this.onCreateLine === other.onCreateLine &&
      this.onSelectGroup === other.onSelectGroup &&
      this.comments.length === other.comments.length &&
      this.comments.every((comment, index) => comment === other.comments[index])
  }

  override toDOM(): HTMLElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'me-comment-gutter-badge'
    if (this.comments.length === 0) {
      button.classList.add('me-comment-gutter-badge--create')
    } else if (this.comments.every((comment) => comment.status === 'resolved')) {
      button.classList.add('me-comment-gutter-badge--resolved')
    }
    appendCommentIcon(button)
    button.setAttribute('aria-label', this.comments.length ? 'Open comments' : 'Comment on line')
    button.addEventListener('mousedown', (event) => {
      event.preventDefault()
      event.stopPropagation()
    })
    button.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      if (this.comments.length) this.onSelectGroup(this.comments)
      else this.onCreateLine?.()
    })
    return button
  }

  override ignoreEvent(): boolean {
    return false
  }
}

function buildCommentDecorations(
  view: EditorView,
  comments: readonly EditorComment[],
  onSelect: (comment: EditorComment) => void,
  onSelectGroup: (comments: readonly EditorComment[]) => void,
  onCreateLine?: ((from: number, to: number) => void) | undefined,
): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const byLine = new Map<number, EditorComment[]>()
  const doc = view.state.doc

  for (const comment of comments) {
    if (!validAnchor(comment, doc.length)) continue
    const { from, to } = comment.anchor
    const statusClass = comment.status === 'resolved' ? ' me-comment-anchor--resolved' : ''
    ranges.push(
      Decoration.mark({
        class: `me-comment-anchor${statusClass}`,
        attributes: {
          'data-me-comment-id': comment.id,
          title: comment.body,
        },
      }).range(from, to),
    )

    const line = doc.lineAt(from)
    const lineComments = byLine.get(line.number) ?? []
    lineComments.push(comment)
    byLine.set(line.number, lineComments)
  }

  const decoratedLines = new Set<number>()
  for (const [lineNumber, lineComments] of byLine) {
    const line = doc.line(lineNumber)
    decoratedLines.add(lineNumber)
    ranges.push(
      Decoration.line({ class: 'me-comment-gutter-line' }).range(line.from),
      Decoration.widget({
        widget: new CommentBadgeWidget(lineComments, onSelect, onSelectGroup),
        side: 1,
      }).range(line.to),
    )
  }

  if (onCreateLine) {
    const activeLine = doc.lineAt(view.state.selection.main.head).number
    for (const visibleRange of view.visibleRanges) {
      let lineNumber = doc.lineAt(visibleRange.from).number
      const finalLine = doc.lineAt(visibleRange.to).number
      while (lineNumber <= finalLine) {
        if (!decoratedLines.has(lineNumber)) {
          const line = doc.line(lineNumber)
          if (line.length > 0) {
            const activeClass = lineNumber === activeLine ? ' me-comment-gutter-line--active' : ''
            ranges.push(
              Decoration.line({ class: `me-comment-gutter-line${activeClass}` }).range(line.from),
              Decoration.widget({
                widget: new CommentBadgeWidget([], onSelect, onSelectGroup, () => onCreateLine(line.from, line.to)),
                side: 1,
              }).range(line.to),
            )
          }
        }
        lineNumber += 1
      }
    }
  }

  return RangeSet.of(ranges, true)
}

export function commentDecorationsExtension(
  comments: readonly EditorComment[],
  onSelect: (comment: EditorComment) => void,
  onSelectGroup: (comments: readonly EditorComment[]) => void,
  onCreateLine?: ((from: number, to: number) => void) | undefined,
) {
  const commentsById = new Map(comments.map((comment) => [comment.id, comment]))
  const decorations = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet

      constructor(view: EditorView) {
        this.decorations = buildCommentDecorations(view, comments, onSelect, onSelectGroup, onCreateLine)
      }

      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildCommentDecorations(update.view, comments, onSelect, onSelectGroup, onCreateLine)
        }
      }
    },
    { decorations: (instance) => instance.decorations },
  )

  return [
    decorations,
    EditorView.domEventHandlers({
      click(event) {
        const target = event.target as HTMLElement | null
        const anchor = target?.closest<HTMLElement>('[data-me-comment-id]')
        const comment = anchor ? commentsById.get(anchor.dataset.meCommentId ?? '') : undefined
        if (!comment) return false
        onSelect(comment)
        return true
      },
    }),
  ]
}
