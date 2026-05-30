import { EditorView, WidgetType, Decoration } from '@codemirror/view'
import type { DecorationSet } from '@codemirror/view'
import { ViewPlugin, type ViewUpdate } from '@codemirror/view'
import { RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

let uploadPlaceholderId = 0
let imagePickerId = 0

type ImageUploadFn = (file: File) => Promise<string>

function markdownImage(alt: string, src: string): string {
  return `![${alt}](${src})`
}

function replaceUploadPlaceholder(
  view: EditorView,
  placeholder: string,
  replacement: string,
): void {
  const currentDoc = view.state.doc.toString()
  const placeholderIdx = currentDoc.indexOf(placeholder)
  if (placeholderIdx === -1) return

  view.dispatch({
    changes: {
      from: placeholderIdx,
      to: placeholderIdx + placeholder.length,
      insert: replacement,
    },
  })
}

function insertUploadPlaceholder(
  view: EditorView,
  file: File,
  from: number,
  to: number,
  uploadFn: ImageUploadFn,
): void {
  const placeholderId = `${Date.now()}-${uploadPlaceholderId++}`
  const placeholder = markdownImage(file.name, `__uploading__${placeholderId}`)

  view.dispatch({
    changes: { from, to, insert: placeholder },
    selection: { anchor: from + placeholder.length },
  })

  void (async () => {
    try {
      const url = await uploadFn(file)
      replaceUploadPlaceholder(view, placeholder, markdownImage(file.name, url))
    } catch {
      replaceUploadPlaceholder(view, placeholder, `[image upload failed: ${file.name}]`)
    }
  })()
}

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

// ── Image picker widget ───────────────────────────────────────────────────────

interface ImagePickerState {
  id: string
  pos: number
}

const addImagePickerEffect = StateEffect.define<ImagePickerState>()
const removeImagePickerEffect = StateEffect.define<string>()

class ImagePickerWidget extends WidgetType {
  constructor(
    readonly picker: ImagePickerState,
    readonly getUploadFn: () => ImageUploadFn | undefined,
  ) {
    super()
  }

  override eq(other: ImagePickerWidget): boolean {
    return this.picker.id === other.picker.id && this.picker.pos === other.picker.pos
  }

  override toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'me-image-picker'

    // Keep CodeMirror from treating picker interactions as editor clicks.
    // Do not preventDefault: inputs/buttons still need native focus and activation.
    for (const eventName of ['mousedown', 'mouseup', 'click', 'keydown']) {
      wrapper.addEventListener(eventName, (event) => event.stopPropagation())
    }

    const title = document.createElement('div')
    title.className = 'me-image-picker__title'
    title.textContent = 'Add an image'
    wrapper.appendChild(title)

    const tabs = document.createElement('div')
    tabs.className = 'me-image-picker__tabs'

    const uploadPanel = document.createElement('div')
    uploadPanel.className = 'me-image-picker__panel'

    const linkPanel = document.createElement('form')
    linkPanel.className = 'me-image-picker__panel'
    linkPanel.hidden = true

    const uploadTab = document.createElement('button')
    uploadTab.type = 'button'
    uploadTab.className = 'me-image-picker__tab me-image-picker__tab--active'
    uploadTab.textContent = 'Upload'

    const linkTab = document.createElement('button')
    linkTab.type = 'button'
    linkTab.className = 'me-image-picker__tab'
    linkTab.textContent = 'Link'

    function selectTab(tab: 'upload' | 'link') {
      const uploadActive = tab === 'upload'
      uploadTab.classList.toggle('me-image-picker__tab--active', uploadActive)
      linkTab.classList.toggle('me-image-picker__tab--active', !uploadActive)
      uploadPanel.hidden = !uploadActive
      linkPanel.hidden = uploadActive
    }

    uploadTab.addEventListener('click', () => selectTab('upload'))
    linkTab.addEventListener('click', () => selectTab('link'))
    tabs.append(uploadTab, linkTab)
    wrapper.appendChild(tabs)

    const fileInput = document.createElement('input')
    fileInput.type = 'file'
    fileInput.accept = 'image/*'
    fileInput.hidden = true

    const uploadButton = document.createElement('button')
    uploadButton.type = 'button'
    uploadButton.className = 'me-image-picker__upload'
    uploadButton.textContent = 'Upload file'

    const uploadHint = document.createElement('div')
    uploadHint.className = 'me-image-picker__hint'

    const hasUpload = Boolean(this.getUploadFn())
    if (hasUpload) {
      uploadHint.textContent = 'Choose an image from your device'
      uploadButton.addEventListener('click', () => fileInput.click())
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0]
        const uploadFn = this.getUploadFn()
        if (!file || !uploadFn) return

        view.dispatch({ effects: removeImagePickerEffect.of(this.picker.id) })
        insertUploadPlaceholder(view, file, this.picker.pos, this.picker.pos, uploadFn)
      })
    } else {
      uploadButton.disabled = true
      uploadHint.textContent = 'Uploads need an onImageUpload handler from the host app'
    }

    uploadPanel.append(uploadButton, uploadHint, fileInput)

    const linkInput = document.createElement('input')
    linkInput.type = 'url'
    linkInput.placeholder = 'Paste the image link…'
    linkInput.className = 'me-image-picker__input'

    const linkButton = document.createElement('button')
    linkButton.type = 'submit'
    linkButton.className = 'me-image-picker__submit'
    linkButton.textContent = 'Embed image'

    const linkHint = document.createElement('div')
    linkHint.className = 'me-image-picker__hint'
    linkHint.textContent = 'Works with any image from the web'

    linkPanel.addEventListener('submit', (event) => {
      event.preventDefault()
      const url = linkInput.value.trim()
      if (!url) return

      const insert = markdownImage('', url)
      view.dispatch({
        changes: { from: this.picker.pos, to: this.picker.pos, insert },
        selection: { anchor: this.picker.pos + insert.length },
        effects: removeImagePickerEffect.of(this.picker.id),
        scrollIntoView: true,
      })
    })

    linkPanel.append(linkInput, linkButton, linkHint)
    wrapper.append(uploadPanel, linkPanel)

    return wrapper
  }

  override ignoreEvent(): boolean {
    return false
  }
}

function buildPickerDecorations(
  pickers: readonly ImagePickerState[],
  getUploadFn: () => ImageUploadFn | undefined,
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  for (const picker of [...pickers].sort((a, b) => a.pos - b.pos)) {
    builder.add(
      picker.pos,
      picker.pos,
      Decoration.widget({
        widget: new ImagePickerWidget(picker, getUploadFn),
        side: 1,
        block: true,
      }),
    )
  }
  return builder.finish()
}

export function imagePickerExtension(getUploadFn: () => ImageUploadFn | undefined) {
  const field = StateField.define<readonly ImagePickerState[]>({
    create() {
      return []
    },
    update(value, tr) {
      let next = value.map((picker) => ({ ...picker, pos: tr.changes.mapPos(picker.pos) }))

      for (const effect of tr.effects) {
        if (effect.is(addImagePickerEffect)) {
          next = [...next.filter((picker) => picker.id !== effect.value.id), effect.value]
        } else if (effect.is(removeImagePickerEffect)) {
          next = next.filter((picker) => picker.id !== effect.value)
        }
      }

      if (tr.docChanged) {
        const docLength = tr.state.doc.length
        next = next.filter((picker) => picker.pos <= docLength)
      }

      return next
    },
    provide: (field) => EditorView.decorations.compute([field], (state) => {
      return buildPickerDecorations(state.field(field), getUploadFn)
    }),
  })

  return field
}

export function insertImagePicker(view: EditorView): boolean {
  const pos = view.state.selection.main.from
  view.dispatch({
    effects: addImagePickerEffect.of({ id: `image-picker-${imagePickerId++}`, pos }),
    selection: { anchor: pos },
    scrollIntoView: true,
  })
  return true
}

// ── Image paste handler ───────────────────────────────────────────────────────

/**
 * Returns a paste event handler that intercepts image file pastes.
 * Pass the onImageUpload callback; if absent, image paste is ignored.
 */
export function imagePasteHandler(
  getUploadFn: () => ImageUploadFn | undefined
) {
  function insertDroppedUploadPlaceholders(view: EditorView, files: File[], insertPos: number): void {
    let nextPos = insertPos

    for (const [index, file] of files.entries()) {
      const separator = index === 0 ? '' : '\n'
      const uploadFn = getUploadFn()
      if (!uploadFn) continue

      const placeholderId = `${Date.now()}-${uploadPlaceholderId++}`
      const placeholder = markdownImage(file.name, `__uploading__${placeholderId}`)
      const insert = `${separator}${placeholder}`

      view.dispatch({
        changes: { from: nextPos, to: nextPos, insert },
        selection: { anchor: nextPos + insert.length },
      })

      void (async () => {
        try {
          const url = await uploadFn(file)
          replaceUploadPlaceholder(view, placeholder, markdownImage(file.name, url))
        } catch {
          replaceUploadPlaceholder(view, placeholder, `[image upload failed: ${file.name}]`)
        }
      })()

      nextPos += insert.length
    }
  }

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
        insertUploadPlaceholder(view, file, sel.from, sel.to, uploadFn)

        break // only handle first image in the paste
      }

      return handled
    },
    dragover(event) {
      if (event.dataTransfer?.files?.length) {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
        return true
      }
      return false
    },
    drop(event, view) {
      const uploadFn = getUploadFn()
      if (!uploadFn) return false

      const files = Array.from(event.dataTransfer?.files ?? [])
      const imageFiles = files.filter((file) => file.type.startsWith('image/'))
      if (imageFiles.length === 0) return false

      event.preventDefault()

      const coords = { x: event.clientX, y: event.clientY }
      const dropPos = view.posAtCoords(coords)
      const insertPos = dropPos ?? view.state.selection.main.from

      insertDroppedUploadPlaceholders(view, imageFiles, insertPos)

      return true
    },
  })
}
