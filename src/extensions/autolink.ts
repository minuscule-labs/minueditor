import { EditorView } from '@codemirror/view'
import type { MarkdownEditorMode, WikiLinkPasteResolver } from '../types'

const URL_REGEX = /^https?:\/\/[^\s]+$/
const EMPTY_LIST_ITEM_REGEX = /^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX/]\]\s+)?$/
const INVALID_WIKILINK_TEXT = /[\u0000-\u001f\u007f]|\]\]/

export type AutolinkPasteConfig = {
  mode: MarkdownEditorMode
  resolvePastedUrl?: WikiLinkPasteResolver
}

function exactHttpUrl(source: string): string | null {
  const candidate = source.trim()
  return candidate && URL_REGEX.test(candidate) ? candidate : null
}

function eligibleSemanticUrl(source: string): boolean {
  try {
    const parsed = new URL(source)
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      !parsed.username &&
      !parsed.password
    )
  } catch {
    return false
  }
}

function safeWikiLinkPart(value: string): boolean {
  return value.length > 0 && !INVALID_WIKILINK_TEXT.test(value)
}

function safeWikiLinkTarget(value: string): boolean {
  return Boolean(value.trim()) && !value.includes('|') && safeWikiLinkPart(value)
}

function resolvedWikiLink(
  sourceUrl: string,
  selectedText: string,
  config: AutolinkPasteConfig,
): string | null {
  const resolver = config.resolvePastedUrl
  if (
    !resolver ||
    !eligibleSemanticUrl(sourceUrl) ||
    (selectedText && !safeWikiLinkPart(selectedText))
  ) return null

  try {
    const resolution = resolver(sourceUrl, {
      selectedText,
      mode: config.mode,
    })
    const target = resolution?.target
    if (
      typeof target !== 'string' ||
      !safeWikiLinkTarget(target)
    ) return null
    return selectedText ? `[[${target}|${selectedText}]]` : `[[${target}]]`
  } catch {
    return null
  }
}

/**
 * Intercepts exact HTTP(S) URL paste events. Recognized host URLs become
 * canonical wikilinks; all other candidates retain standard Markdown-link
 * insertion behavior.
 */
export function autolinkPaste(config: AutolinkPasteConfig) {
  return EditorView.domEventHandlers({
    paste(event, view) {
      if (!view.state.facet(EditorView.editable)) return false
      if (Array.from(event.clipboardData?.items ?? []).some((item) => item.kind === 'file')) {
        return false
      }

      const getData = event.clipboardData?.getData
      const plain = typeof getData === 'function'
        ? getData.call(event.clipboardData, 'text/plain')
        : ''
      const text = exactHttpUrl(plain ?? '')
      if (!text) return false

      const state = view.state
      const sel = state.selection.main
      const selectedText = sel.empty ? '' : state.doc.sliceString(sel.from, sel.to)
      const wikiLink = resolvedWikiLink(text, selectedText, config)

      event.preventDefault()

      if (wikiLink) {
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: wikiLink },
          selection: {
            anchor: selectedText
              ? sel.from + wikiLink.length - 2
              : sel.from + wikiLink.length,
          },
          scrollIntoView: true,
        })
        return true
      }

      if (!sel.empty) {
        view.dispatch({
          changes: {
            from: sel.from,
            to: sel.to,
            insert: `[${selectedText}](${text})`,
          },
          selection: { anchor: sel.from + 1 + selectedText.length },
        })
        return true
      }

      const line = state.doc.lineAt(sel.from)
      const lineContent = line.text.trim()
      const insert = `[${text}](${text})`

      if (lineContent === '' || EMPTY_LIST_ITEM_REGEX.test(line.text)) {
        const insertFrom = lineContent === '' ? line.from : sel.from
        view.dispatch({
          changes: lineContent === ''
            ? { from: line.from, to: line.to, insert }
            : { from: sel.from, insert },
          selection: { anchor: insertFrom + insert.length },
        })
      } else {
        view.dispatch({
          changes: { from: sel.from, insert },
          selection: { anchor: sel.from + insert.length },
        })
      }

      return true
    },
  })
}
