import { RangeSet, StateField, type EditorState } from '@codemirror/state'
import type { Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import type { DocumentAnnotation } from '../types'

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function clampLineNumber(lineNumber: number, maxLine: number): number {
  if (lineNumber < 1) return 1
  if (lineNumber > maxLine) return maxLine
  return lineNumber
}

function annotationClassNames(annotation: DocumentAnnotation): string {
  const classes = ['me-annotation']

  classes.push(`me-annotation--kind-${slugify(annotation.kind)}`)

  if (annotation.actorType) {
    classes.push(`me-annotation--actor-${slugify(annotation.actorType)}`)
  }

  if (annotation.status) {
    classes.push(`me-annotation--status-${slugify(annotation.status)}`)
  }

  if (annotation.className) {
    classes.push(annotation.className)
  }

  return classes.join(' ')
}

function annotationAttributes(annotation: DocumentAnnotation): Record<string, string> {
  const attributes: Record<string, string> = {
    'data-me-annotation-id': annotation.id,
    'data-me-annotation-kind': annotation.kind,
    'data-me-annotation-anchor': annotation.anchorType,
  }

  if (annotation.actorType) {
    attributes['data-me-annotation-actor-type'] = annotation.actorType
  }

  if (annotation.actorId) {
    attributes['data-me-annotation-actor-id'] = annotation.actorId
  }

  if (annotation.status) {
    attributes['data-me-annotation-status'] = annotation.status
  }

  if (annotation.label) {
    attributes.title = annotation.label
  }

  return attributes
}

function buildAnnotationDecorations(state: EditorState, annotations: readonly DocumentAnnotation[]): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const doc = state.doc
  const maxLine = doc.lines || 1

  for (const annotation of annotations) {
    const className = annotationClassNames(annotation)
    const attributes = annotationAttributes(annotation)

    if (annotation.anchorType === 'line') {
      const startLine = clampLineNumber(annotation.startLine ?? 1, maxLine)
      const endLine = clampLineNumber(annotation.endLine ?? startLine, maxLine)
      const fromLine = Math.min(startLine, endLine)
      const toLine = Math.max(startLine, endLine)

      for (let lineNumber = fromLine; lineNumber <= toLine; lineNumber++) {
        const line = doc.line(lineNumber)
        const edgeClasses = [
          lineNumber === fromLine ? 'me-annotation--line-first' : '',
          lineNumber === toLine ? 'me-annotation--line-last' : '',
        ].filter(Boolean).join(' ')
        ranges.push(
          Decoration.line({
            class: `${className} me-annotation--line${edgeClasses ? ` ${edgeClasses}` : ''}`,
            attributes,
          }).range(line.from),
        )
      }

      continue
    }

    const from = annotation.from ?? 0
    const to = annotation.to ?? from
    if (to <= from) continue

    ranges.push(
      Decoration.mark({
        class: `${className} me-annotation--range`,
        attributes,
      }).range(Math.max(0, from), Math.min(doc.length, to)),
    )
  }

  return RangeSet.of(ranges, true)
}

export function documentAnnotationExtension(
  annotations: readonly DocumentAnnotation[] = [],
  onAnnotationClick?: (annotation: DocumentAnnotation, view: EditorView) => void,
) {
  const annotationsById = new Map(annotations.map((annotation) => [annotation.id, annotation]))

  const annotationDecorationField = StateField.define<DecorationSet>({
    create(state) {
      return buildAnnotationDecorations(state, annotations)
    },
    update(value, tr) {
      if (!tr.docChanged) {
        return value
      }

      return buildAnnotationDecorations(tr.state, annotations)
    },
    provide: (field) => EditorView.decorations.from(field),
  })

  return [
    annotationDecorationField,
    EditorView.domEventHandlers({
      click(event, view) {
        if (!onAnnotationClick) return false

        const target = event.target as HTMLElement | null
        const annotationElement = target?.closest<HTMLElement>('[data-me-annotation-id]')
        if (!annotationElement) return false

        const annotationId = annotationElement.dataset.meAnnotationId
        if (!annotationId) return false

        const annotation = annotationsById.get(annotationId)
        if (!annotation) return false

        onAnnotationClick(annotation, view)
        return true
      },
    }),
  ]
}
