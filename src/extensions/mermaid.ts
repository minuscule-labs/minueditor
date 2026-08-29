import { syntaxTree } from '@codemirror/language'
import { RangeSet, StateField, type EditorState, type Extension, type Range } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view'
import type { MermaidConfig, MermaidEngine, MermaidRenderResult, SlashCommand } from '../types'
import { startAsyncBlockRender } from './rich-blocks/lifecycle'

export type MermaidBlock = {
  from: number
  to: number
  contentFrom: number
  contentTo: number
  source: string
}

type NormalizedMermaidConfig = {
  enabled: boolean
  interactive: boolean
  theme: NonNullable<MermaidConfig['theme']>
  load: () => Promise<MermaidEngine>
}

type MermaidElement = HTMLElement & { __meCancelMermaid?: () => void }

let mermaidId = 0
let mermaidRenderQueue: Promise<void> = Promise.resolve()
let defaultEnginePromise: Promise<MermaidEngine> | null = null

function loadDefaultMermaid(): Promise<MermaidEngine> {
  defaultEnginePromise ??= import('mermaid').then((module) => module.default as MermaidEngine)
  return defaultEnginePromise
}

export function normalizeMermaidConfig(
  input: boolean | MermaidConfig | undefined,
): NormalizedMermaidConfig {
  if (input == null || input === false) {
    return { enabled: false, interactive: true, theme: 'default', load: loadDefaultMermaid }
  }
  if (input === true) {
    return { enabled: true, interactive: true, theme: 'default', load: loadDefaultMermaid }
  }
  return {
    enabled: input.enabled !== false,
    interactive: input.interactive !== false,
    theme: input.theme ?? 'default',
    load: input.load ?? loadDefaultMermaid,
  }
}

export function findMermaidBlocks(state: EditorState): MermaidBlock[] {
  const blocks: MermaidBlock[] = []
  const doc = state.doc

  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'FencedCode') return
      const opening = doc.lineAt(node.from)
      const openingMatch = /^\s*(`{3,}|~{3,})\s*mermaid\s*$/i.exec(opening.text)
      if (!openingMatch) return

      const closing = doc.lineAt(node.to)
      const fence = openingMatch[1]
      const fenceCharacter = fence[0]
      const closingPattern = new RegExp(`^\\s*${fenceCharacter}{${fence.length},}\\s*$`)
      if (closing.number <= opening.number || !closingPattern.test(closing.text)) return

      const contentFrom = doc.line(opening.number + 1).from
      const contentTo = Math.max(contentFrom, closing.from - 1)
      blocks.push({
        from: node.from,
        to: node.to,
        contentFrom,
        contentTo,
        source: doc.sliceString(contentFrom, contentTo),
      })
    },
  })

  return blocks
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Unable to render Mermaid diagram.'
  return message.slice(0, 300)
}

async function renderMermaid(
  source: string,
  config: NormalizedMermaidConfig,
  signal: AbortSignal,
): Promise<MermaidRenderResult> {
  const engine = await config.load()
  const execute = async () => {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
    engine.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme: config.theme,
    })
    mermaidId += 1
    return engine.render(`me-mermaid-${mermaidId}`, source)
  }

  // Mermaid uses singleton configuration and shared DOM bookkeeping. Serialize
  // initialize/render pairs across editor and static surfaces to prevent one
  // concurrent diagram from leaving another permanently in its loading state.
  const result = mermaidRenderQueue.then(execute, execute)
  mermaidRenderQueue = result.then(() => undefined, () => undefined)
  return result
}

function createMermaidInteraction(
  body: HTMLElement,
  svg: SVGElement,
  controls: HTMLElement,
): () => void {
  const minimumScale = 1
  const maximumScale = 5
  const zoomFactor = 1.25
  const pointers = new Map<number, { x: number; y: number }>()
  let scale = minimumScale
  let x = 0
  let y = 0
  let gesture: {
    scale: number
    x: number
    y: number
    distance: number
    midpoint: { x: number; y: number }
  } | null = null

  const zoomIn = controls.querySelector<HTMLButtonElement>('[data-me-mermaid-action="zoom-in"]')!
  const zoomOut = controls.querySelector<HTMLButtonElement>('[data-me-mermaid-action="zoom-out"]')!
  const reset = controls.querySelector<HTMLButtonElement>('[data-me-mermaid-action="reset"]')!

  const applyTransform = () => {
    if (scale === minimumScale) {
      x = 0
      y = 0
    }
    svg.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    zoomOut.disabled = scale <= minimumScale
    zoomIn.disabled = scale >= maximumScale
    reset.disabled = scale === minimumScale && x === 0 && y === 0
  }

  const zoomTo = (nextScale: number, clientX?: number, clientY?: number) => {
    const clamped = Math.min(maximumScale, Math.max(minimumScale, nextScale))
    if (clamped === scale) return
    const rect = body.getBoundingClientRect()
    const anchorX = (clientX ?? rect.left + rect.width / 2) - rect.left - rect.width / 2
    const anchorY = (clientY ?? rect.top + rect.height / 2) - rect.top - rect.height / 2
    const ratio = clamped / scale
    x = ratio * x + (1 - ratio) * anchorX
    y = ratio * y + (1 - ratio) * anchorY
    scale = clamped
    applyTransform()
  }

  const resetView = () => {
    scale = minimumScale
    x = 0
    y = 0
    applyTransform()
  }

  const onZoomIn = () => zoomTo(scale * zoomFactor)
  const onZoomOut = () => zoomTo(scale / zoomFactor)
  const onReset = () => resetView()
  const onDoubleClick = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    resetView()
  }
  const onWheel = (event: WheelEvent) => {
    const nextScale = scale * Math.exp(-event.deltaY * 0.002)
    const clamped = Math.min(maximumScale, Math.max(minimumScale, nextScale))
    if (clamped === scale) return
    event.preventDefault()
    event.stopPropagation()
    zoomTo(clamped, event.clientX, event.clientY)
  }
  const pointerMidpoint = () => {
    const [first, second] = [...pointers.values()]
    return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
  }
  const pointerDistance = () => {
    const [first, second] = [...pointers.values()]
    return Math.hypot(second.x - first.x, second.y - first.y)
  }
  const onPointerDown = (event: PointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    body.focus()
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    body.setPointerCapture?.(event.pointerId)
    if (pointers.size === 2) {
      gesture = {
        scale,
        x,
        y,
        distance: Math.max(1, pointerDistance()),
        midpoint: pointerMidpoint(),
      }
    }
  }
  const onPointerMove = (event: PointerEvent) => {
    const previous = pointers.get(event.pointerId)
    if (!previous) return
    event.preventDefault()
    event.stopPropagation()
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size >= 2 && gesture) {
      const midpoint = pointerMidpoint()
      const nextScale = Math.min(
        maximumScale,
        Math.max(minimumScale, gesture.scale * pointerDistance() / gesture.distance),
      )
      const ratio = nextScale / gesture.scale
      const rect = body.getBoundingClientRect()
      const anchorX = gesture.midpoint.x - rect.left - rect.width / 2
      const anchorY = gesture.midpoint.y - rect.top - rect.height / 2
      x = ratio * gesture.x + (1 - ratio) * anchorX + midpoint.x - gesture.midpoint.x
      y = ratio * gesture.y + (1 - ratio) * anchorY + midpoint.y - gesture.midpoint.y
      scale = nextScale
    } else {
      x += event.clientX - previous.x
      y += event.clientY - previous.y
    }
    applyTransform()
  }
  const onPointerUp = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return
    event.preventDefault()
    event.stopPropagation()
    pointers.delete(event.pointerId)
    body.releasePointerCapture?.(event.pointerId)
    gesture = null
  }
  const onKeyDown = (event: KeyboardEvent) => {
    const panStep = 30
    if (event.key === '+' || event.key === '=') zoomTo(scale * zoomFactor)
    else if (event.key === '-') zoomTo(scale / zoomFactor)
    else if (event.key === '0' || event.key === 'Escape') resetView()
    else if (event.key === 'ArrowLeft') x += panStep
    else if (event.key === 'ArrowRight') x -= panStep
    else if (event.key === 'ArrowUp') y += panStep
    else if (event.key === 'ArrowDown') y -= panStep
    else return
    event.preventDefault()
    event.stopPropagation()
    applyTransform()
  }

  zoomIn.addEventListener('click', onZoomIn)
  zoomOut.addEventListener('click', onZoomOut)
  reset.addEventListener('click', onReset)
  body.addEventListener('wheel', onWheel, { passive: false })
  body.addEventListener('pointerdown', onPointerDown)
  body.addEventListener('pointermove', onPointerMove)
  body.addEventListener('pointerup', onPointerUp)
  body.addEventListener('pointercancel', onPointerUp)
  body.addEventListener('keydown', onKeyDown)
  body.addEventListener('dblclick', onDoubleClick)
  controls.querySelectorAll('button').forEach((button) => button.removeAttribute('disabled'))
  applyTransform()

  return () => {
    zoomIn.removeEventListener('click', onZoomIn)
    zoomOut.removeEventListener('click', onZoomOut)
    reset.removeEventListener('click', onReset)
    body.removeEventListener('wheel', onWheel)
    body.removeEventListener('pointerdown', onPointerDown)
    body.removeEventListener('pointermove', onPointerMove)
    body.removeEventListener('pointerup', onPointerUp)
    body.removeEventListener('pointercancel', onPointerUp)
    body.removeEventListener('keydown', onKeyDown)
    body.removeEventListener('dblclick', onDoubleClick)
  }
}

function createMermaidControls(): HTMLElement {
  const controls = document.createElement('span')
  controls.className = 'me-mermaid-controls'
  controls.setAttribute('aria-label', 'Diagram view controls')
  const definitions = [
    { action: 'zoom-out', label: 'Zoom out', text: '−' },
    { action: 'reset', label: 'Reset diagram view', text: 'Reset' },
    { action: 'zoom-in', label: 'Zoom in', text: '+' },
  ]
  for (const definition of definitions) {
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.meMermaidAction = definition.action
    button.setAttribute('aria-label', definition.label)
    button.title = definition.label
    button.textContent = definition.text
    button.disabled = true
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', (event) => event.stopPropagation())
    controls.appendChild(button)
  }
  return controls
}

function createMermaidSurface(
  source: string,
  config: NormalizedMermaidConfig,
  editable: boolean,
  requestEdit?: () => void,
): MermaidElement {
  const wrapper = document.createElement('figure') as MermaidElement
  wrapper.className = 'me-mermaid-block me-mermaid-block--loading'
  wrapper.setAttribute('aria-label', 'Mermaid diagram')

  const header = document.createElement('figcaption')
  header.className = 'me-mermaid-header'
  const label = document.createElement('span')
  label.className = 'me-mermaid-label'
  label.textContent = 'Mermaid'
  header.appendChild(label)

  const headerActions = document.createElement('span')
  headerActions.className = 'me-mermaid-header-actions'
  let controls: HTMLElement | null = null
  if (config.interactive) {
    controls = createMermaidControls()
    headerActions.appendChild(controls)
  }
  if (editable && requestEdit) {
    const edit = document.createElement('button')
    edit.type = 'button'
    edit.className = 'me-mermaid-edit'
    edit.textContent = 'Edit source'
    edit.addEventListener('mousedown', (event) => event.preventDefault())
    edit.addEventListener('click', requestEdit)
    headerActions.appendChild(edit)
  }
  if (headerActions.childElementCount > 0) header.appendChild(headerActions)
  wrapper.appendChild(header)

  const body = document.createElement('div')
  body.className = 'me-mermaid-body'
  const status = document.createElement('div')
  status.className = 'me-mermaid-status'
  status.setAttribute('role', 'status')
  status.textContent = 'Rendering diagram…'
  body.appendChild(status)
  wrapper.appendChild(body)

  let cleanupInteraction: () => void = () => undefined
  const cancelRender = startAsyncBlockRender({
    render: (signal) => renderMermaid(source, config, signal),
    apply(result) {
      wrapper.classList.remove('me-mermaid-block--loading')
      wrapper.classList.add('me-mermaid-block--ready')
      body.innerHTML = result.svg
      result.bindFunctions?.(body)
      const svg = body.querySelector<SVGElement>('svg')
      if (controls && svg) {
        body.classList.add('me-mermaid-body--interactive')
        body.tabIndex = 0
        body.setAttribute('aria-label', 'Interactive Mermaid diagram. Use arrow keys to pan, plus and minus to zoom, and zero to reset.')
        cleanupInteraction = createMermaidInteraction(body, svg, controls)
      }
    },
    fail(error) {
      wrapper.classList.remove('me-mermaid-block--loading')
      wrapper.classList.add('me-mermaid-block--error')
      body.replaceChildren()

      const message = document.createElement('div')
      message.className = 'me-mermaid-error'
      message.setAttribute('role', 'status')
      message.textContent = errorMessage(error)
      body.appendChild(message)

      const sourceFallback = document.createElement('pre')
      sourceFallback.className = 'me-mermaid-source-fallback'
      sourceFallback.textContent = source
      body.appendChild(sourceFallback)
    },
  })
  wrapper.__meCancelMermaid = () => {
    cancelRender()
    cleanupInteraction()
  }

  return wrapper
}

class MermaidWidget extends WidgetType {
  constructor(
    readonly block: MermaidBlock,
    readonly config: NormalizedMermaidConfig,
    readonly isEditable: boolean,
  ) {
    super()
  }

  override eq(other: MermaidWidget): boolean {
    return this.block.from === other.block.from &&
      this.block.to === other.block.to &&
      this.block.source === other.block.source &&
      this.config.theme === other.config.theme &&
      this.config.interactive === other.config.interactive &&
      this.config.load === other.config.load &&
      this.isEditable === other.isEditable
  }

  override toDOM(view: EditorView): HTMLElement {
    return createMermaidSurface(
      this.block.source,
      this.config,
      this.isEditable,
      this.isEditable
        ? () => {
            view.focus()
            view.dispatch({
              effects: view.scrollSnapshot(),
              selection: { anchor: this.block.contentFrom },
            })
          }
        : undefined,
    )
  }

  override destroy(dom: HTMLElement): void {
    const element = dom as MermaidElement
    element.__meCancelMermaid?.()
    delete element.__meCancelMermaid
  }

  override ignoreEvent(): boolean {
    return false
  }
}

function selectionInsideBlock(state: EditorState, block: MermaidBlock): boolean {
  return state.selection.ranges.some((range) =>
    range.from > block.from && range.to < block.to,
  )
}

function buildMermaidDecorations(
  state: EditorState,
  config: NormalizedMermaidConfig,
): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const editable = state.facet(EditorView.editable)

  for (const block of findMermaidBlocks(state)) {
    if (editable && selectionInsideBlock(state, block)) continue
    ranges.push(
      Decoration.replace({
        widget: new MermaidWidget(block, config, editable),
        block: true,
        inclusive: true,
      }).range(block.from, block.to),
    )
  }

  return RangeSet.of(ranges, true)
}

export function mermaidBlockExtension(input?: boolean | MermaidConfig): Extension {
  const config = normalizeMermaidConfig(input)
  if (!config.enabled) return []

  return StateField.define<DecorationSet>({
    create(state) {
      return buildMermaidDecorations(state, config)
    },
    update(value, transaction) {
      const syntaxTreeChanged = syntaxTree(transaction.startState) !== syntaxTree(transaction.state)
      if (!transaction.docChanged && !transaction.selection && !syntaxTreeChanged) return value
      return buildMermaidDecorations(transaction.state, config)
    },
    provide: (field) => EditorView.decorations.from(field),
  })
}

export function enhanceRendererMermaid(
  container: HTMLElement,
  input?: boolean | MermaidConfig,
): () => void {
  const config = normalizeMermaidConfig(input)
  if (!config.enabled) return () => undefined

  const surfaces: Array<{ surface: MermaidElement; sourceBlock: HTMLPreElement }> = []
  for (const block of container.querySelectorAll<HTMLPreElement>('pre[data-language="mermaid"]')) {
    const source = block.textContent ?? ''
    const surface = createMermaidSurface(source, config, false)
    block.replaceWith(surface)
    surfaces.push({ surface, sourceBlock: block })
  }

  return () => {
    for (const { surface, sourceBlock } of surfaces) {
      surface.__meCancelMermaid?.()
      delete surface.__meCancelMermaid
      // React StrictMode replays effects without rebuilding dangerously-set
      // inner HTML. Restore the source element so the second setup can start a
      // fresh render instead of leaving the first cancelled loading surface.
      if (surface.isConnected) surface.replaceWith(sourceBlock)
    }
  }
}

export const mermaidSlashCommand: SlashCommand = {
  label: 'Mermaid Diagram',
  detail: 'Insert an editable Mermaid diagram',
  keywords: ['diagram', 'graph', 'flowchart'],
  run(view) {
    const line = view.state.doc.lineAt(view.state.selection.main.from)
    const source = '```mermaid\ngraph TD\n  A[Start] --> B[End]\n```'
    view.dispatch({
      changes: { from: line.from, to: line.to, insert: source },
      selection: { anchor: line.from + '```mermaid\n'.length },
      scrollIntoView: true,
    })
    return true
  },
}
