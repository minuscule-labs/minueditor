import {
  acceptCompletion,
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from '@codemirror/autocomplete'
import { StateEffect, type Extension, type Range } from '@codemirror/state'
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
} from '@codemirror/view'
import type {
  WikiLinksConfig,
  WikiLinkResolution,
  WikiLinkStatus,
  WikiLinkSuggestion,
} from '../types'

export type WikiLinkSpan = {
  from: number
  to: number
  target: string
  label?: string
  openFrom: number
  openTo: number
  targetFrom: number
  targetTo: number
  pipeFrom: number | null
  pipeTo: number | null
  labelFrom: number
  labelTo: number
  closeFrom: number
  closeTo: number
}

type WikiLinkConfigInput = boolean | WikiLinksConfig | undefined

type ResolutionCacheEntry = WikiLinkResolution & {
  pending?: boolean
}

const unknownResolution: WikiLinkResolution = { status: 'unknown' }
const wikiLinkRefresh = StateEffect.define<void>()

export function normalizeWikiLinksConfig(config: WikiLinkConfigInput): WikiLinksConfig | null {
  if (config == null || config === false) return null
  if (config === true) return { enabled: true }
  if (config.enabled === false) return null
  return config
}

export function wikiLinkSpans(lineText: string, lineFrom: number): WikiLinkSpan[] {
  const spans: WikiLinkSpan[] = []
  let searchFrom = 0

  while (searchFrom < lineText.length) {
    const openIndex = lineText.indexOf('[[', searchFrom)
    if (openIndex < 0) break

    const closeIndex = lineText.indexOf(']]', openIndex + 2)
    if (closeIndex < 0) break

    const innerFrom = openIndex + 2
    const innerTo = closeIndex
    const inner = lineText.slice(innerFrom, innerTo)
    const pipeIndex = inner.indexOf('|')
    const targetFromLocal = innerFrom
    const targetToLocal = pipeIndex >= 0 ? innerFrom + pipeIndex : innerTo
    const rawTarget = lineText.slice(targetFromLocal, targetToLocal)
    const target = rawTarget.trim()

    if (target.length > 0) {
      const from = lineFrom + openIndex
      const to = lineFrom + closeIndex + 2
      const pipeFrom = pipeIndex >= 0 ? lineFrom + targetToLocal : null
      const labelFrom = pipeIndex >= 0 ? lineFrom + targetToLocal + 1 : lineFrom + targetFromLocal
      const labelTo = pipeIndex >= 0 ? lineFrom + innerTo : lineFrom + targetToLocal
      const rawLabel = pipeIndex >= 0 ? lineText.slice(targetToLocal + 1, innerTo) : undefined

      const span: WikiLinkSpan = {
        from,
        to,
        target,
        openFrom: from,
        openTo: lineFrom + innerFrom,
        targetFrom: lineFrom + targetFromLocal,
        targetTo: lineFrom + targetToLocal,
        pipeFrom,
        pipeTo: pipeFrom == null ? null : pipeFrom + 1,
        labelFrom,
        labelTo,
        closeFrom: lineFrom + closeIndex,
        closeTo: to,
      }
      if (rawLabel && rawLabel.length > 0) span.label = rawLabel
      spans.push(span)
    }

    searchFrom = closeIndex + 2
  }

  return spans
}

function selectionTouchesWikiLink(view: EditorView, span: WikiLinkSpan): boolean {
  return view.state.selection.ranges.some((range) => {
    if (range.empty) return range.from >= span.from && range.from <= span.to
    return range.from < span.to && range.to > span.from
  })
}

function statusClass(status: WikiLinkStatus): string {
  return `me-wikilink--${status}`
}

function resolutionStatus(resolution: WikiLinkResolution | undefined): WikiLinkStatus {
  return resolution?.status ?? 'unknown'
}

function isPromiseLike(value: WikiLinkResolution | Promise<WikiLinkResolution>): value is Promise<WikiLinkResolution> {
  return typeof (value as Promise<WikiLinkResolution>).then === 'function'
}

function markerDecoration(from: number, to: number): Range<Decoration> | null {
  if (to <= from) return null
  return Decoration.mark({ class: 'me-wikilink-marker me-token me-token--inline' }).range(from, to)
}

function buildWikiLinkDecorations(
  view: EditorView,
  resolve: (target: string) => ResolutionCacheEntry,
): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const doc = view.state.doc
  const rangesToScan = view.visibleRanges.length > 0 ? view.visibleRanges : [{ from: 0, to: doc.length }]

  for (const { from, to } of rangesToScan) {
    const fromLine = doc.lineAt(from)
    const toLine = doc.lineAt(to)

    for (let lineNumber = fromLine.number; lineNumber <= toLine.number; lineNumber += 1) {
      const line = doc.line(lineNumber)

      for (const span of wikiLinkSpans(line.text, line.from)) {
        if (selectionTouchesWikiLink(view, span)) continue

        const status = resolutionStatus(resolve(span.target))
        const markerClass = statusClass(status)
        const labelFrom = span.label ? span.labelFrom : span.targetFrom
        const labelTo = span.label ? span.labelTo : span.targetTo

        const markerRanges = [
          markerDecoration(span.openFrom, span.openTo),
          markerDecoration(span.label ? span.targetFrom : span.targetTo, span.label ? span.labelFrom : span.closeFrom),
          markerDecoration(span.closeFrom, span.closeTo),
        ]

        for (const range of markerRanges) {
          if (range) ranges.push(range)
        }

        if (labelTo > labelFrom) {
          ranges.push(
            Decoration.mark({
              class: `me-wikilink me-wikilink-label ${markerClass}`,
              attributes: {
                'data-me-wikilink-target': span.target,
              },
            }).range(labelFrom, labelTo),
          )
        }
      }
    }
  }

  return Decoration.set(ranges, true)
}

export function wikiLinkDecorations(config: WikiLinksConfig): Extension {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet
      cache = new Map<string, ResolutionCacheEntry>()

      constructor(readonly view: EditorView) {
        this.decorations = buildWikiLinkDecorations(view, (target) => this.resolve(target))
      }

      resolve(target: string): ResolutionCacheEntry {
        const cached = this.cache.get(target)
        if (cached) return cached

        if (!config.resolve) {
          const entry: ResolutionCacheEntry = { ...unknownResolution }
          this.cache.set(target, entry)
          return entry
        }

        try {
          const resolution = config.resolve(target)
          if (!isPromiseLike(resolution)) {
            const entry: ResolutionCacheEntry = resolution
            this.cache.set(target, entry)
            return entry
          }

          const pending: ResolutionCacheEntry = { status: 'unknown', pending: true }
          this.cache.set(target, pending)
          resolution
            .then((resolved) => {
              this.cache.set(target, resolved)
              this.view.dispatch({ effects: wikiLinkRefresh.of() })
            })
            .catch(() => {
              this.cache.set(target, { status: 'unknown' })
              this.view.dispatch({ effects: wikiLinkRefresh.of() })
            })
          return pending
        } catch {
          const entry: ResolutionCacheEntry = { status: 'unknown' }
          this.cache.set(target, entry)
          return entry
        }
      }

      update(update: ViewUpdate) {
        const forceRefresh = update.transactions.some((transaction) =>
          transaction.effects.some((effect) => effect.is(wikiLinkRefresh))
        )

        if (forceRefresh || update.docChanged || update.viewportChanged || update.selectionSet || update.focusChanged) {
          if (update.docChanged) this.cache.clear()
          this.decorations = buildWikiLinkDecorations(update.view, (target) => this.resolve(target))
        }
      }
    },
    {
      decorations: (instance) => instance.decorations,
    },
  )
}

function wikiLinkAtPosition(view: EditorView, pos: number): WikiLinkSpan | null {
  const line = view.state.doc.lineAt(pos)

  for (const span of wikiLinkSpans(line.text, line.from)) {
    if (pos >= span.from && pos <= span.to) return span
  }

  return null
}

function wikiLinkTargetFromEventTarget(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null
  return target.closest<HTMLElement>('[data-me-wikilink-target]')?.dataset.meWikilinkTarget ?? null
}

function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
}

function isModifierClick(event: MouseEvent): boolean {
  return event.button === 0 && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey
}

export function wikiLinkInteractions(config: WikiLinksConfig): Extension {
  if (!config.onOpen && !config.onCreate) return []

  return EditorView.domEventHandlers({
    click(event, view) {
      const decoratedTarget = wikiLinkTargetFromEventTarget(event.target)
      let target: string | null = null

      if (isPlainClick(event)) {
        if (config.openOnClick !== true || !decoratedTarget) return false
        target = decoratedTarget
      } else if (isModifierClick(event)) {
        if (config.openOnModifierClick === false) return false
        target = decoratedTarget
        if (!target) {
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
          if (pos == null) return false
          target = wikiLinkAtPosition(view, pos)?.target ?? null
        }
      }

      if (!target) return false

      event.preventDefault()
      const linkTarget = target
      void (async () => {
        const status = config.resolve ? (await config.resolve(linkTarget)).status : 'unknown'
        if (status === 'unresolved' && config.onCreate) {
          await config.onCreate(linkTarget)
          return
        }
        if (config.onOpen) {
          config.onOpen(linkTarget, { event })
          return
        }
        await config.onCreate?.(linkTarget)
      })().catch(() => {
        if (config.onOpen) config.onOpen(linkTarget, { event })
      })
      return true
    },
  })
}

function wikiLinkCompletionRange(context: CompletionContext): { from: number; to: number; query: string } | null {
  const line = context.state.doc.lineAt(context.pos)
  const before = line.text.slice(0, context.pos - line.from)
  const openIndex = before.lastIndexOf('[[')
  if (openIndex < 0) return null

  const previousCloseIndex = before.lastIndexOf(']]')
  if (previousCloseIndex > openIndex) return null

  const query = before.slice(openIndex + 2)
  if (/[[\]\n|]/.test(query)) return null
  if (!context.explicit && openIndex + 2 !== before.length && query.length === 0) return null

  return {
    from: line.from + openIndex + 2,
    to: context.pos,
    query,
  }
}

function suggestionToCompletion(suggestion: WikiLinkSuggestion): Completion {
  const completion: Completion = {
    label: suggestion.label ?? suggestion.target,
    type: 'text',
    boost: 1,
    apply(view, _completion, from, to) {
      const after = view.state.doc.sliceString(to, Math.min(to + 2, view.state.doc.length))
      const insert = after === ']]' ? suggestion.target : `${suggestion.target}]]`
      view.dispatch({
        changes: { from, to, insert },
        selection: { anchor: from + suggestion.target.length + (after === ']]' ? 0 : 2) },
        scrollIntoView: true,
      })
    },
  }
  if (suggestion.detail) completion.detail = suggestion.detail
  return completion
}

export function wikiLinkCompletions(config: WikiLinksConfig): CompletionSource {
  return async (context): Promise<CompletionResult | null> => {
    if (!config.suggest) return null

    const range = wikiLinkCompletionRange(context)
    if (!range) return null

    const suggestions = await config.suggest(range.query)

    return {
      from: range.from,
      to: range.to,
      options: suggestions.map(suggestionToCompletion),
      validFor: /^[^\]\[|\n]*$/,
    }
  }
}

export function wikiLinkCompletionExtension(config: WikiLinksConfig): Extension {
  if (!config.suggest) return []

  return [
    autocompletion({
      override: [wikiLinkCompletions(config)],
    }),
    keymap.of([
      {
        key: 'Tab',
        run: acceptCompletion,
      },
    ]),
  ]
}

export function wikiLinksExtension(
  config: WikiLinkConfigInput,
  options: { completion?: boolean } = {},
): Extension {
  const normalized = normalizeWikiLinksConfig(config)
  if (!normalized) return []

  return [
    wikiLinkDecorations(normalized),
    wikiLinkInteractions(normalized),
    ...(options.completion === false ? [] : [wikiLinkCompletionExtension(normalized)]),
  ]
}
