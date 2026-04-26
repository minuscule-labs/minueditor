import { EditorView, WidgetType, Decoration } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { RangeSetBuilder } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

// ── Image widget ──────────────────────────────────────────────────────────────

class ImageWidget extends WidgetType {
  constructor(
    readonly alt: string,
    readonly src: string
  ) {
    super()
  }

  override eq(other: ImageWidget): boolean {
    return this.alt === other.alt && this.src === other.src
  }

  override toDOM(): HTMLElement {
    const wrapper = document.createElement('span')
    wrapper.className = 'me-image-wrapper'

    if (this.src.startsWith('__uploading__')) {
      // Uploading placeholder
      const placeholder = document.createElement('span')
      placeholder.className = 'me-image-uploading'
      placeholder.textContent = `Uploading ${this.alt}…`
      wrapper.appendChild(placeholder)
    } else {
      const img = document.createElement('img')
      img.src = this.src
      img.alt = this.alt
      img.className = 'me-image'
      img.setAttribute('loading', 'lazy')

      img.addEventListener('error', () => {
        img.replaceWith(brokenImagePlaceholder(this.alt))
      })

      wrapper.appendChild(img)
    }

    return wrapper
  }
}

function brokenImagePlaceholder(alt: string): HTMLElement {
  const el = document.createElement('span')
  el.className = 'me-image-broken'
  el.textContent = alt ? `[image: ${alt}]` : '[broken image]'
  return el
}

// ── Decoration builder ────────────────────────────────────────────────────────

function buildImageDecorations(view: EditorView): DecorationSet {
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
        if (node.name !== 'Image') return

        const lineNum = doc.lineAt(node.from).number
        if (activeLines.has(lineNum)) return

        const rawText = doc.sliceString(node.from, node.to)
        // Standard markdown image: ![alt](src)
        const match = rawText.match(/^!\[([^\]]*)\]\(([^)]*)\)$/)
        if (!match) return

        const [, alt, src] = match

        builder.add(
          node.from,
          node.to,
          Decoration.replace({
            widget: new ImageWidget(alt, src),
          })
        )
      },
    })
  }

  return builder.finish()
}

// ── ViewPlugin ────────────────────────────────────────────────────────────────

export const imageDecorations = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildImageDecorations(view)
    }

    update(update: ViewUpdate) {
      if (
        update.docChanged ||
        update.viewportChanged ||
        update.selectionSet
      ) {
        this.decorations = buildImageDecorations(update.view)
      }
    }
  },
  {
    decorations: (instance) => instance.decorations,
  }
)

// ── Image paste handler ───────────────────────────────────────────────────────

/**
 * Returns a paste event handler that intercepts image file pastes.
 * Pass the onImageUpload callback; if absent, image paste is ignored.
 */
export function imagePasteHandler(
  getUploadFn: () => ((file: File) => Promise<string>) | undefined
) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      const uploadFn = getUploadFn()
      if (!uploadFn) return false

      const items = event.clipboardData?.items
      if (!items) return false

      let handled = false
      for (const item of Array.from(items)) {
        if (!item.type.startsWith('image/')) continue

        const file = item.getAsFile()
        if (!file) continue

        event.preventDefault()
        handled = true

        const sel = view.state.selection.main
        const placeholder = `![${file.name}](__uploading__${Date.now()})`

        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: placeholder },
        })

        void (async () => {
          try {
            const url = await uploadFn(file)
            const finalMarkdown = `![${file.name}](${url})`
            const currentDoc = view.state.doc.toString()
            const placeholderIdx = currentDoc.indexOf(placeholder)
            if (placeholderIdx !== -1) {
              view.dispatch({
                changes: {
                  from: placeholderIdx,
                  to: placeholderIdx + placeholder.length,
                  insert: finalMarkdown,
                },
              })
            }
          } catch {
            const currentDoc = view.state.doc.toString()
            const placeholderIdx = currentDoc.indexOf(placeholder)
            if (placeholderIdx !== -1) {
              view.dispatch({
                changes: {
                  from: placeholderIdx,
                  to: placeholderIdx + placeholder.length,
                  insert: '',
                },
              })
            }
          }
        })()

        break // only handle first image in the paste
      }

      return handled
    },
  })
}
