import { EditorSelection, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { RichPasteConfig } from '../types'

type NormalizedRichPasteConfig = {
  enabled: boolean
  html: boolean
  tabular: boolean
}

export function normalizeRichPasteConfig(
  input: boolean | RichPasteConfig | undefined,
): NormalizedRichPasteConfig {
  if (input === false) return { enabled: false, html: false, tabular: false }
  if (input === true || input == null) return { enabled: true, html: true, tabular: true }
  if (input.enabled === false) return { enabled: false, html: false, tabular: false }
  return {
    enabled: true,
    html: input.html !== false,
    tabular: input.tabular !== false,
  }
}

function safeUrl(value: string): string | null {
  const url = value.trim()
  if (/^(https?:|mailto:)/i.test(url) || url.startsWith('#') || url.startsWith('/')) return url
  return null
}

function compactInline(value: string): string {
  return value
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\r\n ]+/g, ' ')
}

function longestBacktickRun(value: string): number {
  return Math.max(0, ...Array.from(value.matchAll(/`+/g), (match) => match[0].length))
}

function directChildren(element: Element, selector: string): Element[] {
  return Array.from(element.children).filter((child) => child.matches(selector))
}

function convertTable(table: Element): string {
  const rows = Array.from(table.querySelectorAll('tr')).map((row) =>
    Array.from(row.querySelectorAll(':scope > th, :scope > td')).map((cell) =>
      compactInline(convertChildren(cell)).trim().replace(/\|/g, '\\|'),
    ),
  ).filter((row) => row.length > 0)

  if (rows.length === 0) return ''
  const width = Math.max(...rows.map((row) => row.length))
  const normalized = rows.map((row) => [...row, ...Array.from({ length: width - row.length }, () => '')])
  const header = normalized[0]
  const body = normalized.slice(1)
  const line = (cells: readonly string[]) => `| ${cells.join(' | ')} |`

  return [line(header), line(header.map(() => '---')), ...body.map(line)].join('\n')
}

function convertList(list: Element, depth = 0): string {
  const ordered = list.tagName === 'OL'
  const items = directChildren(list, 'li')

  return items.map((item, index) => {
    const nestedLists = directChildren(item, 'ul, ol')
    const clone = item.cloneNode(true) as Element
    directChildren(clone, 'ul, ol').forEach((nested) => nested.remove())
    const content = compactInline(convertChildren(clone)).trim()
    const marker = ordered ? `${index + 1}.` : '-'
    const indent = '  '.repeat(depth)
    const lines = [`${indent}${marker} ${content}`.trimEnd()]

    for (const nested of nestedLists) {
      const nestedMarkdown = convertList(nested, depth + 1)
      if (nestedMarkdown) lines.push(nestedMarkdown)
    }

    return lines.join('\n')
  }).join('\n')
}

function convertElement(element: Element): string {
  const tag = element.tagName.toLowerCase()

  if (['script', 'style', 'template', 'noscript', 'iframe', 'object'].includes(tag)) return ''
  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1])
    return `${'#'.repeat(level)} ${compactInline(convertChildren(element)).trim()}\n\n`
  }
  if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') {
    const content = convertChildren(element).trim()
    return content ? `${content}\n\n` : ''
  }
  if (tag === 'br') return '\n'
  if (tag === 'strong' || tag === 'b') return `**${convertChildren(element).trim()}**`
  if (tag === 'em' || tag === 'i') return `*${convertChildren(element).trim()}*`
  if (tag === 'del' || tag === 's' || tag === 'strike') return `~~${convertChildren(element).trim()}~~`
  if (tag === 'code' && element.parentElement?.tagName !== 'PRE') {
    const content = element.textContent ?? ''
    const fence = '`'.repeat(Math.max(1, longestBacktickRun(content) + 1))
    return `${fence}${content}${fence}`
  }
  if (tag === 'pre') {
    const code = element.querySelector(':scope > code')
    const content = (code?.textContent ?? element.textContent ?? '').replace(/\n$/, '')
    const languageMatch = /(?:^|\s)language-([\w+-]+)/.exec(code?.className ?? '')
    const language = languageMatch?.[1] ?? ''
    const fence = '`'.repeat(Math.max(3, longestBacktickRun(content) + 1))
    return `${fence}${language}\n${content}\n${fence}\n\n`
  }
  if (tag === 'a') {
    const label = compactInline(convertChildren(element)).trim()
    const href = safeUrl(element.getAttribute('href') ?? '')
    return href && label ? `[${label}](${href})` : label
  }
  // HTML-only images can hotlink or embed untrusted data. Image files use the
  // host-owned onImageUpload path instead.
  if (tag === 'img') return ''
  if (tag === 'ul' || tag === 'ol') return `${convertList(element)}\n\n`
  if (tag === 'li') return convertChildren(element)
  if (tag === 'blockquote') {
    const content = convertChildren(element).trim()
    return content ? `${content.split('\n').map((line) => `> ${line}`.trimEnd()).join('\n')}\n\n` : ''
  }
  if (tag === 'table') return `${convertTable(element)}\n\n`
  if (tag === 'hr') return '---\n\n'

  return convertChildren(element)
}

function convertChildren(parent: ParentNode): string {
  return Array.from(parent.childNodes).map((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (parent.nodeType === Node.DOCUMENT_FRAGMENT_NODE && !text.trim()) return ''
      return compactInline(text)
    }
    if (node.nodeType === Node.ELEMENT_NODE) return convertElement(node as Element)
    return ''
  }).join('')
}

export function htmlToMarkdown(html: string): string {
  if (!html.trim() || typeof document === 'undefined') return ''
  const template = document.createElement('template')
  template.innerHTML = html
  return convertChildren(template.content)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function tabularTextToMarkdown(text: string): string | null {
  const normalized = text.replace(/\r\n?/g, '\n').replace(/\n$/, '')
  if (!normalized.includes('\t')) return null

  const rows = normalized.split('\n').map((row) => row.split('\t'))
  if (rows.length === 0 || rows.every((row) => row.length < 2)) return null

  const width = Math.max(...rows.map((row) => row.length))
  if (width < 2) return null
  const cells = rows.map((row) => [
    ...row.map((cell) => cell.trim().replace(/\|/g, '\\|').replace(/\n/g, ' ')),
    ...Array.from({ length: width - row.length }, () => ''),
  ])
  const line = (row: readonly string[]) => `| ${row.join(' | ')} |`

  return [line(cells[0]), line(cells[0].map(() => '---')), ...cells.slice(1).map(line)].join('\n')
}

export function looksLikeMarkdown(text: string): boolean {
  if (!text.trim()) return false
  return /(^|\n)\s{0,3}(#{1,6}\s|>\s|[-*+]\s|\d+\.\s|```|~~~|\|.+\|)|\[[^\]]+\]\([^)]+\)|\[\[[^\]]+\]\]|\*\*[^*]+\*\*/m.test(text)
}

export function richClipboardToMarkdown(
  plain: string,
  html: string,
  input?: boolean | RichPasteConfig,
): string | null {
  const config = normalizeRichPasteConfig(input)
  if (!config.enabled) return null

  if (config.tabular) {
    const table = tabularTextToMarkdown(plain)
    if (table) return table
  }

  if (!config.html || looksLikeMarkdown(plain) || !html.trim()) return null
  const markdown = htmlToMarkdown(html)
  if (!markdown || markdown === plain.trim()) return null
  return markdown
}

function insertText(view: EditorView, text: string): boolean {
  if (!view.state.facet(EditorView.editable)) return false
  const transaction = view.state.changeByRange((range) => ({
    changes: { from: range.from, to: range.to, insert: text },
    range: EditorSelection.cursor(range.from + text.length),
  }))
  view.dispatch({ ...transaction, scrollIntoView: true })
  return true
}

function clipboardHasFiles(event: ClipboardEvent): boolean {
  return Array.from(event.clipboardData?.items ?? []).some((item) =>
    item.kind === 'file' || (item.type.startsWith('image/') && typeof item.getAsFile === 'function'),
  )
}

/** Rich paste conversion for HTML and spreadsheet-style tabular text. */
export function richPasteExtension(input?: boolean | RichPasteConfig): Extension {
  const config = normalizeRichPasteConfig(input)
  if (!config.enabled) return []

  return EditorView.domEventHandlers({
    paste(event, view) {
      if (clipboardHasFiles(event)) return false
      const clipboard = event.clipboardData
      if (!clipboard || typeof clipboard.getData !== 'function') return false

      const markdown = richClipboardToMarkdown(
        clipboard.getData('text/plain'),
        clipboard.getData('text/html'),
        config,
      )
      if (!markdown) return false

      event.preventDefault()
      return insertText(view, markdown)
    },
  })
}

/** Preserve the platform's Mod-Shift-V gesture as an explicit plain-text escape hatch. */
export function pasteAsPlainTextExtension(enabled = true): Extension {
  if (!enabled) return []
  let requested = false

  return EditorView.domEventHandlers({
    keydown(event) {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'v') {
        requested = true
      }
      return false
    },
    blur() {
      requested = false
      return false
    },
    paste(event, view) {
      if (!requested) return false
      requested = false
      const text = event.clipboardData?.getData('text/plain')
      if (text == null) return false
      event.preventDefault()
      return insertText(view, text)
    },
  })
}
