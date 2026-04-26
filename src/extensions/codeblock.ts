import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

// ── Copy button widget ────────────────────────────────────────────────────────

class CopyButtonWidget extends WidgetType {
  constructor(readonly code: string) {
    super()
  }

  override eq(other: CopyButtonWidget): boolean {
    return this.code === other.code
  }

  override toDOM(): HTMLElement {
    const btn = document.createElement('button')
    btn.className = 'me-copy-btn'
    btn.textContent = 'Copy'
    btn.setAttribute('type', 'button')
    btn.setAttribute('aria-label', 'Copy code')

    btn.addEventListener('mousedown', (e) => e.preventDefault())
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(this.code)
        btn.textContent = 'Copied'
        btn.classList.add('me-copy-btn--copied')
        setTimeout(() => {
          btn.textContent = 'Copy'
          btn.classList.remove('me-copy-btn--copied')
        }, 1500)
      } catch {
        btn.textContent = 'Failed'
        setTimeout(() => {
          btn.textContent = 'Copy'
        }, 1500)
      }
    })

    return btn
  }

  override ignoreEvent(): boolean {
    return false
  }
}

// ── Language label widget ─────────────────────────────────────────────────────

class LangLabelWidget extends WidgetType {
  constructor(readonly lang: string) {
    super()
  }

  override eq(other: LangLabelWidget): boolean {
    return this.lang === other.lang
  }

  override toDOM(): HTMLElement {
    const label = document.createElement('span')
    label.className = 'me-lang-label'
    label.textContent = this.lang
    label.setAttribute('aria-hidden', 'true')
    return label
  }
}

// ── Decoration builder ────────────────────────────────────────────────────────

function buildCodeBlockDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc
  const activeLines = new Set<number>()
  for (const range of view.state.selection.ranges) {
    const from = doc.lineAt(range.from).number
    const to = doc.lineAt(range.to).number
    for (let n = from; n <= to; n++) activeLines.add(n)
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter(node) {
        if (node.name !== 'FencedCode') return

        const blockFrom = node.from
        const blockTo = node.to

        // Check if cursor is anywhere inside the block
        const blockFromLine = doc.lineAt(blockFrom).number
        const blockToLine = doc.lineAt(blockTo).number
        let cursorInBlock = false
        for (let n = blockFromLine; n <= blockToLine; n++) {
          if (activeLines.has(n)) {
            cursorInBlock = true
            break
          }
        }
        if (cursorInBlock) return

        // Extract language from the opening fence line
        const fenceLine = doc.lineAt(blockFrom).text
        const langMatch = fenceLine.match(/^```(\w*)/)
        const lang = langMatch?.[1] ?? ''

        // Extract the code content (between fences)
        const lines: string[] = []
        let inContent = false
        for (let ln = blockFromLine; ln <= blockToLine; ln++) {
          const lineText = doc.line(ln).text
          if (ln === blockFromLine) {
            inContent = true
            continue // skip opening fence
          }
          if (ln === blockToLine) break // skip closing fence
          if (inContent) lines.push(lineText)
        }
        const code = lines.join('\n')

        // Apply codeblock mark to the entire block
        builder.add(
          blockFrom,
          blockTo,
          Decoration.mark({ class: 'me-codeblock' })
        )

        // Language label — injected at the start of the fence line
        if (lang) {
          builder.add(
            blockFrom,
            blockFrom,
            Decoration.widget({
              widget: new LangLabelWidget(lang),
              side: 1,
            })
          )
        }

        // Copy button — injected at the start of the fence line (right side)
        builder.add(
          blockFrom,
          blockFrom,
          Decoration.widget({
            widget: new CopyButtonWidget(code),
            side: 1,
          })
        )
      },
    })
  }

  return builder.finish()
}

// ── ViewPlugin ────────────────────────────────────────────────────────────────

export const codeBlockDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildCodeBlockDecorations(view)
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet
      ) {
        this.decorations = buildCodeBlockDecorations(update.view)
      }
    }
  },
  {
    decorations: (instance) => instance.decorations,
  }
)
