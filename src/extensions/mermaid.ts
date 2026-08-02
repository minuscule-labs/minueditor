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
    return { enabled: false, theme: 'default', load: loadDefaultMermaid }
  }
  if (input === true) return { enabled: true, theme: 'default', load: loadDefaultMermaid }
  return {
    enabled: input.enabled !== false,
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

  if (editable && requestEdit) {
    const edit = document.createElement('button')
    edit.type = 'button'
    edit.className = 'me-mermaid-edit'
    edit.textContent = 'Edit source'
    edit.addEventListener('mousedown', (event) => event.preventDefault())
    edit.addEventListener('click', requestEdit)
    header.appendChild(edit)
  }
  wrapper.appendChild(header)

  const body = document.createElement('div')
  body.className = 'me-mermaid-body'
  const status = document.createElement('div')
  status.className = 'me-mermaid-status'
  status.setAttribute('role', 'status')
  status.textContent = 'Rendering diagram…'
  body.appendChild(status)
  wrapper.appendChild(body)

  wrapper.__meCancelMermaid = startAsyncBlockRender({
    render: (signal) => renderMermaid(source, config, signal),
    apply(result) {
      wrapper.classList.remove('me-mermaid-block--loading')
      wrapper.classList.add('me-mermaid-block--ready')
      body.innerHTML = result.svg
      result.bindFunctions?.(body)
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
      if (!transaction.docChanged && !transaction.selection) return value
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
