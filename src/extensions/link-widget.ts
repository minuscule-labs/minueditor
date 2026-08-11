import { RangeSetBuilder } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import { markdownResources } from '../internal/markdown-resources'
import { resourceUrlConfigFacet } from '../internal/resource-url-extension'
import { resolveAndValidateResourceUrl, validateResourceUrl } from '../internal/resource-urls'

export type ExternalLinkSpan = {
  from: number
  to: number
  labelFrom: number
  labelTo: number
  label: string
  url: string
  destinationMarkdown: string
  titleMarkdown?: string
}

function externalLinkSpans(view: EditorView, from: number, to: number): ExternalLinkSpan[] {
  return markdownResources(view.state, from, to)
    .filter((resource) => resource.kind === 'link')
    .map((resource) => ({
      from: resource.from,
      to: resource.to,
      labelFrom: resource.labelFrom,
      labelTo: resource.labelTo,
      label: resource.label,
      url: resource.destination,
      destinationMarkdown: view.state.doc.sliceString(resource.urlFrom, resource.urlTo),
      ...(resource.title
        ? { titleMarkdown: view.state.doc.sliceString(resource.title.from, resource.title.to) }
        : {}),
    }))
}

function labelFrom(span: ExternalLinkSpan): number {
  return span.labelFrom
}

function labelTo(span: ExternalLinkSpan): number {
  return span.labelTo
}

function closeFrom(span: ExternalLinkSpan): number {
  return span.labelTo
}

function markdownDestination(url: string): string {
  if (!/[\s<>]/.test(url)) return url
  return `<${url.replace(/</g, '%3C').replace(/>/g, '%3E')}>`
}

function linkMarkdown(span: ExternalLinkSpan, label: string, url: string): string {
  const destination = url === span.url ? span.destinationMarkdown : markdownDestination(url)
  const title = span.titleMarkdown ? ` ${span.titleMarkdown}` : ''
  return `[${label}](${destination}${title})`
}

function resolvedLinkUrl(view: EditorView, url: string): string | null {
  const config = view.state.facet(resourceUrlConfigFacet)
  const resource = resolveAndValidateResourceUrl(url, 'link', config.resolver)
  return resource.validation.allowed ? resource.validation.url : null
}

function openExternalUrl(view: EditorView, url: string): boolean {
  const resolved = resolvedLinkUrl(view, url)
  if (!resolved) return false
  window.open(resolved, '_blank', 'noopener,noreferrer')
  return true
}

function copyExternalUrl(view: EditorView, url: string): boolean {
  const resolved = resolvedLinkUrl(view, url)
  if (!resolved) return false
  void navigator.clipboard?.writeText(resolved)
  return true
}

function selectionOverlapsSpan(view: EditorView, span: ExternalLinkSpan): boolean {
  return view.state.selection.ranges.some((range) => {
    if (range.empty) return range.from > span.from && range.from < span.to
    return range.from < span.to && range.to > span.from
  })
}

function currentSpanAt(view: EditorView, from: number, to: number): ExternalLinkSpan | null {
  if (from < 0 || to > view.state.doc.length || from >= to) return null
  return externalLinkSpans(view, from, to).find(
    (span) => span.from === from && span.to === to,
  ) ?? null
}

function spanAtPosition(view: EditorView, pos: number): ExternalLinkSpan | null {
  const safePos = Math.max(0, Math.min(pos, view.state.doc.length))
  const line = view.state.doc.lineAt(safePos)
  return externalLinkSpans(view, line.from, line.to).find(
    (span) => safePos >= span.from && safePos <= span.to,
  ) ?? null
}

function spanForSelection(view: EditorView): ExternalLinkSpan | null {
  const selection = view.state.selection.main
  if (!selection.empty) {
    return externalLinkSpans(view, selection.from, selection.to).find(
      (span) => selection.from >= span.from && selection.to <= span.to,
    ) ?? null
  }
  return spanAtPosition(view, selection.from)
}

function buildExternalLinkDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const doc = view.state.doc
  const rangesToScan = view.visibleRanges.length > 0 ? view.visibleRanges : [{ from: 0, to: doc.length }]
  const visited = new Set<number>()

  for (const { from, to } of rangesToScan) {
    const scanFrom = doc.lineAt(from).from
    const scanTo = doc.lineAt(to).to
    const scannedSpans = externalLinkSpans(view, scanFrom, scanTo)
    for (const span of scannedSpans) {
      if (visited.has(span.from)) continue
      visited.add(span.from)
      // Unsafe canonical destinations remain editable as source but do not
      // receive interactive link controls.
      if (!validateResourceUrl(span.url, 'link').allowed) continue

      // Stable live preview: keep raw markdown visible while the cursor or
      // selection is inside the markdown link. This avoids hidden syntax
      // keyboard edge cases and matches the robust Obsidian/SilverBullet
      // model.
      if (selectionOverlapsSpan(view, span)) continue

      builder.add(span.from, span.labelFrom, Decoration.replace({}))
      builder.add(
        labelFrom(span),
        labelTo(span),
        Decoration.mark({
          class: 'me-link me-link-widget',
          attributes: {
            title: span.url,
            'data-me-link-url': span.url,
            'data-me-link-label': span.label,
            'data-me-link-from': String(span.from),
            'data-me-link-to': String(span.to),
          },
        }),
      )
      builder.add(closeFrom(span), span.to, Decoration.replace({}))
    }
  }

  return builder.finish()
}

type HoverLinkData = Pick<ExternalLinkSpan, 'from' | 'to' | 'label' | 'url'>

function ensureExternalLinkControlStyles(): void {
  let style = document.getElementById('me-link-control-styles') as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = 'me-link-control-styles'
    document.head.append(style)
  }

  style.textContent = `
    .me-link-hover-controls,
    .me-link-editor-panel {
      position: absolute !important;
      z-index: 10000 !important;
      border: 1px solid var(--me-link-popover-border, rgba(148, 163, 184, 0.24)) !important;
      border-radius: 12px !important;
      background: var(--me-link-popover-bg, #252525) !important;
      color: var(--me-link-popover-text, #f8fafc) !important;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.28) !important;
      font: 13px/1.35 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    }
    .me-link-hover-controls[hidden],
    .me-link-editor-panel[hidden] { display: none !important; }
    .me-link-hover-controls {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      max-width: min(38rem, calc(100vw - 1rem));
      padding: 7px 10px;
    }
    .me-link-hover-controls__open {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      max-width: 28rem;
      color: var(--me-link-popover-muted, #cbd5e1);
      text-decoration: none;
    }
    .me-link-hover-controls__url {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .me-link-editor-panel {
      display: flex !important;
      flex-direction: column !important;
      gap: 9px !important;
      width: min(26rem, calc(100vw - 1rem)) !important;
      padding: 11px 12px !important;
    }
    .me-link-editor-panel__field {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .me-link-editor-panel__label {
      color: var(--me-link-popover-muted, #cbd5e1);
      font-size: 12px;
      font-weight: 600;
    }
    .me-link-editor-panel__input {
      min-width: 0;
      border: 1px solid var(--me-link-popover-border, rgba(148, 163, 184, 0.24));
      border-radius: 8px;
      padding: 6px 8px;
      background: var(--me-link-popover-input-bg, #2f2f2f);
      color: inherit;
      font: inherit;
      font-size: 13px;
      outline: none;
    }
    .me-link-editor-panel__input:focus {
      border-color: var(--me-link-popover-focus, #3b82f6);
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.25);
    }
    .me-link-editor-panel__divider {
      height: 1px;
      background: var(--me-link-popover-border, rgba(148, 163, 184, 0.18));
    }
    .me-link-hover-controls button,
    .me-link-editor-panel button {
      border: none;
      border-radius: 7px;
      padding: 5px 8px;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      white-space: nowrap;
    }
    .me-link-hover-controls button:hover,
    .me-link-editor-panel button:hover { background: rgba(148, 163, 184, 0.14); }
    .me-link-hover-controls__copy {
      font-size: 18px !important;
      line-height: 1 !important;
      padding: 5px 7px !important;
    }
    .me-link-editor-panel__remove {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      justify-content: flex-start;
      color: var(--me-link-popover-text, #f8fafc) !important;
      padding: 7px 4px !important;
      font-size: 13px !important;
    }
  `
}

class ExternalLinkEditorPanel {
  readonly dom: HTMLDivElement
  span: ExternalLinkSpan | null = null

  constructor(readonly view: EditorView) {
    ensureExternalLinkControlStyles()
    this.dom = document.createElement('div')
    this.dom.className = 'me-link-editor-panel'
    this.dom.hidden = true
    document.body.append(this.dom)
  }

  destroy(): void {
    this.dom.remove()
  }

  hide(): void {
    this.dom.hidden = true
    this.span = null
  }

  show(span: ExternalLinkSpan, target?: HTMLElement): void {
    this.span = span
    this.render()
    this.position(span, target)
    this.dom.hidden = false

    window.setTimeout(() => {
      const input = this.dom.querySelector('input[aria-label="Link text"]') as HTMLInputElement | null
      input?.focus()
      input?.select()
    }, 0)
  }

  position(span: ExternalLinkSpan, target?: HTMLElement): void {
    const rect = target?.getBoundingClientRect() ?? this.view.coordsAtPos(labelFrom(span))
    const left = rect ? rect.left + window.scrollX : 8
    const top = rect ? rect.bottom + window.scrollY + 6 : 8
    this.dom.style.left = `${Math.max(8, left)}px`
    this.dom.style.top = `${Math.max(8, top)}px`
  }

  render(): void {
    const span = this.span
    if (!span) return

    this.dom.textContent = ''

    const label = document.createElement('input')
    label.className = 'me-link-editor-panel__input'
    label.value = span.label
    label.placeholder = 'Link title'
    label.setAttribute('aria-label', 'Link text')

    const url = document.createElement('input')
    url.className = 'me-link-editor-panel__input me-link-editor-panel__input--url'
    url.value = span.url
    url.placeholder = 'Page or URL'
    url.inputMode = 'url'
    url.setAttribute('aria-label', 'Link URL')

    const updateLink = () => {
      const current = this.currentSpan()
      if (!current) return
      const nextLabel = label.value.trim() || current.label
      const nextUrl = url.value.trim() || current.url
      const insert = linkMarkdown(current, nextLabel, nextUrl)
      this.view.dispatch({
        changes: { from: current.from, to: current.to, insert },
        selection: { anchor: current.from + 1 + nextLabel.length },
      })
      this.span = spanAtPosition(this.view, current.from)
    }

    const remove = () => {
      const current = this.currentSpan()
      if (!current) return
      const nextLabel = label.value.trim() || current.label
      viewDispatchReplace(this.view, current, nextLabel)
      this.hide()
    }

    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === 'Escape') {
        event.preventDefault()
        this.hide()
        this.view.focus()
      }
    }
    label.addEventListener('input', updateLink)
    url.addEventListener('input', updateLink)
    label.addEventListener('change', updateLink)
    url.addEventListener('change', updateLink)
    label.addEventListener('keydown', keydown)
    url.addEventListener('keydown', keydown)

    const urlField = this.field('Page or URL', url)
    const labelField = this.field('Link title', label)

    const divider = document.createElement('div')
    divider.className = 'me-link-editor-panel__divider'

    const removeButton = this.button('🗑 Remove link', remove)
    removeButton.className = 'me-link-editor-panel__remove'

    this.dom.append(urlField, labelField, divider, removeButton)
  }

  currentSpan(): ExternalLinkSpan | null {
    if (!this.span) return null
    return currentSpanAt(this.view, this.span.from, this.span.to)
  }

  field(labelText: string, input: HTMLInputElement): HTMLLabelElement {
    const label = document.createElement('label')
    label.className = 'me-link-editor-panel__field'
    const text = document.createElement('span')
    text.className = 'me-link-editor-panel__label'
    text.textContent = labelText
    label.append(text, input)
    return label
  }

  button(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', (event) => {
      event.preventDefault()
      onClick()
    })
    return button
  }
}

class ExternalLinkHoverControls {
  readonly dom: HTMLDivElement
  hideTimer: number | null = null
  data: HoverLinkData | null = null

  constructor(
    readonly view: EditorView,
    readonly editorPanel: ExternalLinkEditorPanel,
  ) {
    ensureExternalLinkControlStyles()
    this.dom = document.createElement('div')
    this.dom.className = 'me-link-hover-controls'
    this.dom.hidden = true
    this.dom.addEventListener('mouseenter', () => this.cancelHide())
    this.dom.addEventListener('mouseleave', () => this.scheduleHide())
    document.body.append(this.dom)
  }

  destroy(): void {
    this.dom.remove()
  }

  cancelHide(): void {
    if (this.hideTimer !== null) {
      window.clearTimeout(this.hideTimer)
      this.hideTimer = null
    }
  }

  scheduleHide(): void {
    this.cancelHide()
    this.hideTimer = window.setTimeout(() => this.hide(), 500)
  }

  hide(): void {
    this.cancelHide()
    this.dom.hidden = true
    this.data = null
  }

  show(target: HTMLElement, data: HoverLinkData): void {
    const rect = target.getBoundingClientRect()
    this.showAt(rect.left + window.scrollX, rect.bottom + window.scrollY + 2, data, target)
  }

  showAt(left: number, top: number, data: HoverLinkData, target?: HTMLElement): void {
    this.cancelHide()

    if (!this.dom.hidden && this.data?.from === data.from && this.data.to === data.to) return

    this.data = data
    this.render(target)

    this.dom.style.left = `${Math.max(8, left)}px`
    this.dom.style.top = `${Math.max(8, top)}px`
    this.dom.hidden = false
  }

  render(target?: HTMLElement): void {
    const data = this.data
    if (!data) return

    this.dom.textContent = ''

    const open = this.button('', () => openExternalUrl(this.view, data.url))
    open.className = 'me-link-hover-controls__open'
    open.setAttribute('aria-label', 'Open link')
    open.title = data.url
    open.textContent = '🌐 '

    const openText = document.createElement('span')
    openText.className = 'me-link-hover-controls__url'
    openText.textContent = data.url
    open.append(openText)

    const copy = this.button('⧉', () => copyExternalUrl(this.view, data.url))
    copy.className = 'me-link-hover-controls__copy'
    copy.setAttribute('aria-label', 'Copy link')
    copy.title = 'Copy link'

    const edit = this.button('Edit', () => this.editLink(data, target))

    this.dom.append(open, copy, edit)
  }

  button(label: string, onClick: () => void): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', (event) => {
      event.preventDefault()
      onClick()
    })
    return button
  }

  editLink(data: HoverLinkData, target?: HTMLElement): void {
    const span = currentSpanAt(this.view, data.from, data.to)
    if (!span) {
      this.hide()
      return
    }

    this.editorPanel.show(span, target)
    this.hide()
  }

  removeLink(data: HoverLinkData): void {
    const span = currentSpanAt(this.view, data.from, data.to)
    if (!span) {
      this.hide()
      return
    }

    viewDispatchReplace(this.view, span, span.label)
    this.hide()
  }
}

function viewDispatchReplace(
  view: EditorView,
  span: ExternalLinkSpan,
  insert: string,
  selectionAnchor = span.from + insert.length,
): void {
  view.dispatch({
    changes: { from: span.from, to: span.to, insert },
    selection: { anchor: selectionAnchor },
    scrollIntoView: true,
  })
  view.focus()
}

function linkDataFromElement(element: HTMLElement): HoverLinkData | null {
  const from = Number(element.dataset.meLinkFrom)
  const to = Number(element.dataset.meLinkTo)
  const label = element.dataset.meLinkLabel
  const url = element.dataset.meLinkUrl

  if (!Number.isFinite(from) || !Number.isFinite(to) || label == null || url == null) return null
  return { from, to, label, url }
}

function closestLinkWidget(target: EventTarget | null): HTMLElement | null {
  const node = target instanceof Element
    ? target
    : target instanceof Text
      ? target.parentElement
      : null
  return node?.closest?.('.me-link-widget') as HTMLElement | null
}

let suppressNextModifiedLinkClick = false

function openModifiedLinkEvent(
  event: MouseEvent,
  view: EditorView,
  phase: 'down' | 'click',
): boolean {
  if ((!event.metaKey && !event.ctrlKey) || event.altKey || event.shiftKey) return false

  const link = closestLinkWidget(event.target)
  if (!link) return false

  const data = linkDataFromElement(link)
  if (!data) return false

  event.preventDefault()
  event.stopPropagation()

  if (phase === 'click' && suppressNextModifiedLinkClick) {
    suppressNextModifiedLinkClick = false
    return true
  }

  if (!openExternalUrl(view, data.url)) return false
  if (phase === 'down') {
    suppressNextModifiedLinkClick = true
    window.setTimeout(() => {
      suppressNextModifiedLinkClick = false
    }, 0)
  }
  return true
}

const externalLinkEventHandlers = EditorView.domEventHandlers({
  mousedown(event, view) {
    return openModifiedLinkEvent(event, view, 'down')
  },
  click(event, view) {
    return openModifiedLinkEvent(event, view, 'click')
  },
})

type ExternalLinkPluginInstance = {
  openEditor(span: ExternalLinkSpan): void
}

const externalLinkPluginByView = new WeakMap<EditorView, ExternalLinkPluginInstance>()

const externalLinkDecorationsPlugin = ViewPlugin.fromClass(
  class implements ExternalLinkPluginInstance {
    decorations: DecorationSet
    controls: ExternalLinkHoverControls
    editorPanel: ExternalLinkEditorPanel

    constructor(readonly view: EditorView) {
      this.decorations = buildExternalLinkDecorations(view)
      this.editorPanel = new ExternalLinkEditorPanel(view)
      this.controls = new ExternalLinkHoverControls(view, this.editorPanel)
      externalLinkPluginByView.set(view, this)
      document.addEventListener('mousedown', this.handleDocumentMouseDown, true)
      document.addEventListener('focusin', this.handleDocumentFocusIn, true)
      window.addEventListener('blur', this.handleWindowBlur)
    }

    openEditor(span: ExternalLinkSpan): void {
      this.controls.hide()
      this.editorPanel.show(span)
    }

    handleDocumentMouseDown = (event: MouseEvent): void => {
      const target = event.target as Node | null
      if (!target) return
      if (this.editorPanel.dom.contains(target) || this.controls.dom.contains(target)) return

      this.editorPanel.hide()
      if (!closestLinkWidget(event.target)) this.controls.hide()
    }

    handleDocumentFocusIn = (event: FocusEvent): void => {
      const target = event.target as Node | null
      if (!target) return
      if (this.editorPanel.dom.contains(target) || this.controls.dom.contains(target)) return

      this.editorPanel.hide()
      if (!this.view.dom.contains(target)) this.controls.hide()
    }

    handleWindowBlur = (): void => {
      this.controls.hide()
      this.editorPanel.hide()
    }

    closeIfFocusLeftEditorAndPanels(): void {
      window.setTimeout(() => {
        const active = document.activeElement
        if (active && (this.editorPanel.dom.contains(active) || this.controls.dom.contains(active))) return
        if (this.view.hasFocus) return
        this.controls.hide()
        this.editorPanel.hide()
      }, 0)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = buildExternalLinkDecorations(update.view)
        if (update.docChanged || update.selectionSet) this.controls.hide()
      }

      if (update.focusChanged && !update.view.hasFocus) {
        this.closeIfFocusLeftEditorAndPanels()
      }
    }

    destroy() {
      externalLinkPluginByView.delete(this.view)
      document.removeEventListener('mousedown', this.handleDocumentMouseDown, true)
      document.removeEventListener('focusin', this.handleDocumentFocusIn, true)
      window.removeEventListener('blur', this.handleWindowBlur)
      this.controls.destroy()
      this.editorPanel.destroy()
    }
  },
  {
    decorations: (instance) => instance.decorations,
    eventHandlers: {
      mouseover(event, view) {
        const link = closestLinkWidget(event.target)
        if (!link || !view.dom.contains(link)) return false

        const data = linkDataFromElement(link)
        if (!data) return false

        this.controls.show(link, data)
        return false
      },
      mouseout(event) {
        const link = closestLinkWidget(event.target)
        if (!link) return false

        const related = event.relatedTarget as Node | null
        if (related && (link.contains(related) || this.controls.dom.contains(related))) return false

        this.controls.scheduleHide()
        return false
      },
    },
  },
)

export function openExternalLinkEditor(view: EditorView): boolean {
  const span = spanForSelection(view)
  if (!span) return false

  const plugin = view.plugin(externalLinkDecorationsPlugin) ?? externalLinkPluginByView.get(view)
  if (!plugin) return false

  plugin.openEditor(span)
  return true
}

export const externalLinkWidgets = [
  externalLinkEventHandlers,
  externalLinkDecorationsPlugin,
]
