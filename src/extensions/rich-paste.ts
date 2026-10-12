import { EditorSelection, type Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { RichPasteConfig } from '../types'
import { listFragmentIndent, normalizeEmptyListPaste } from './list-paste'

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

const discardedHtmlTags = new Set(['script', 'style', 'template', 'noscript', 'iframe', 'object'])

type HtmlConversionInfo = { hasLists: boolean }
type TaskControl = { element: Element; marker: '[ ]' | '[/]' | '[x]' }

function firstMeaningfulChild(parent: ParentNode): ChildNode | undefined {
  return Array.from(parent.childNodes).find(node => node.nodeType === Node.ELEMENT_NODE
    || (node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim())))
}

function leadingTaskControl(item: Element): TaskControl | null {
  let node: ChildNode | undefined = item.getAttribute('role') === 'checkbox' ? item : firstMeaningfulChild(item)
  while (node?.nodeType === Node.ELEMENT_NODE) {
    const element = node as Element
    if (discardedHtmlTags.has(element.tagName.toLowerCase()) || ['UL', 'OL'].includes(element.tagName)) return null
    const native = element.matches('input[type="checkbox"]')
    if (native || element.getAttribute('role') === 'checkbox') {
      const checked = element.getAttribute('aria-checked')
      const marker = checked === 'mixed' ? '[/]' : checked === 'true' ? '[x]'
        : checked === 'false' ? '[ ]' : native ? (element.hasAttribute('checked') ? '[x]' : '[ ]') : null
      return marker ? { element, marker } : null
    }
    // Only descend through leading presentation wrappers. Never borrow a nested
    // list's control, or infer a checkbox from a class/icon or later label text.
    if (!['SPAN', 'LABEL', 'P', 'DIV'].includes(element.tagName)) return null
    node = firstMeaningfulChild(element)
  }
  return null
}

function convertTable(table: Element, info: HtmlConversionInfo): string {
  const rows = Array.from(table.querySelectorAll('tr')).map((row) =>
    Array.from(row.querySelectorAll(':scope > th, :scope > td')).map((cell) =>
      compactInline(convertChildren(cell, info)).trim().replace(/\|/g, '\\|'),
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

function convertList(list: Element, info: HtmlConversionInfo, indent = ''): string {
  const ordered = list.tagName === 'OL'
  const items = directChildren(list, 'li')
  if (items.length) info.hasLists = true

  return items.map((item, index) => {
    const clone = item.cloneNode(true) as Element
    const task = leadingTaskControl(clone)
    if (task) {
      if (task.element !== clone) {
        // ARIA controls can wrap the label itself. Keep meaningful children,
        // while dropping empty controls and conventional checkbox glyphs.
        if (/^[✓✔☐☑☒−–-]?$/.test(task.element.textContent?.trim() ?? '')) task.element.remove()
        else if (['SPAN', 'LABEL', 'P', 'DIV', 'BUTTON'].includes(task.element.tagName)) {
          while (task.element.firstChild) task.element.before(task.element.firstChild)
          task.element.remove()
        }
      }
    }
    const nestedLists = directChildren(clone, 'ul, ol')
    nestedLists.forEach((nested) => nested.remove())
    const content = compactInline(convertChildren(clone, info)).trim()
    const marker = ordered ? `${index + 1}.` : '-'
    const lines = [`${indent}${marker} ${task ? `${task.marker} ` : ''}${content}`.trimEnd()]

    for (const nested of nestedLists) {
      const nestedMarkdown = convertList(nested, info, indent + ' '.repeat(marker.length + 1))
      if (nestedMarkdown) lines.push(nestedMarkdown)
    }

    return lines.join('\n')
  }).join('\n')
}

function convertElement(element: Element, info: HtmlConversionInfo): string {
  const tag = element.tagName.toLowerCase()

  if (discardedHtmlTags.has(tag)) return ''
  if (/^h[1-6]$/.test(tag)) {
    const level = Number(tag[1])
    return `${'#'.repeat(level)} ${compactInline(convertChildren(element, info)).trim()}\n\n`
  }
  if (tag === 'p' || tag === 'div' || tag === 'section' || tag === 'article') {
    const content = convertChildren(element, info).trim()
    return content ? `${content}\n\n` : ''
  }
  if (tag === 'br') return '\n'
  if (tag === 'strong' || tag === 'b') return `**${convertChildren(element, info).trim()}**`
  if (tag === 'em' || tag === 'i') return `*${convertChildren(element, info).trim()}*`
  if (tag === 'del' || tag === 's' || tag === 'strike') return `~~${convertChildren(element, info).trim()}~~`
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
    const label = compactInline(convertChildren(element, info)).trim()
    const href = safeUrl(element.getAttribute('href') ?? '')
    return href && label ? `[${label}](${href})` : label
  }
  // HTML-only images can hotlink or embed untrusted data. Image files use the
  // host-owned onImageUpload path instead.
  if (tag === 'img') return ''
  if (tag === 'ul' || tag === 'ol') return `${convertList(element, info)}\n\n`
  if (tag === 'li') return convertChildren(element, info)
  if (tag === 'blockquote') {
    const content = convertChildren(element, info).trim()
    return content ? `${content.split('\n').map((line) => `> ${line}`.trimEnd()).join('\n')}\n\n` : ''
  }
  if (tag === 'table') return `${convertTable(element, info)}\n\n`
  if (tag === 'hr') return '---\n\n'

  return convertChildren(element, info)
}

function convertChildren(parent: ParentNode, info: HtmlConversionInfo): string {
  return Array.from(parent.childNodes).map((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (parent.nodeType === Node.DOCUMENT_FRAGMENT_NODE && !text.trim()) return ''
      return compactInline(text)
    }
    if (node.nodeType === Node.ELEMENT_NODE) return convertElement(node as Element, info)
    return ''
  }).join('')
}

function convertHtml(html: string): HtmlConversionInfo & { markdown: string } {
  const info = { hasLists: false }
  if (!html.trim() || typeof document === 'undefined') return { ...info, markdown: '' }
  const template = document.createElement('template')
  template.innerHTML = html
  const markdown = convertChildren(template.content, info)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { ...info, markdown }
}

export function htmlToMarkdown(html: string): string {
  return convertHtml(html).markdown
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

  // Author-owned task Markdown stays exact, including tab indentation and
  // quoted/ordered tasks. It must not be mistaken for spreadsheet cells.
  if (/^(?:[ \t]*>[ \t]*)*[ \t]*(?:[-*+]|\d+[.)])[ \t]+\[[ xX/]\](?:[ \t]|\r?$)/m.test(plain)) return null
  if (listFragmentIndent(plain) != null) return null
  const canConvertHtml = config.html && !looksLikeMarkdown(plain) && Boolean(html.trim())
  // This cheap prefilter only avoids unnecessary HTML parsing before TSV;
  // recognition still requires an actual list converted from the inert DOM.
  let converted = canConvertHtml && /<(?:ul|ol)\b/i.test(html) ? convertHtml(html) : null
  // Browser text for nested HTML lists can contain indentation tabs. Confirmed
  // HTML lists take precedence over the spreadsheet heuristic.
  if (converted?.hasLists && converted.markdown !== plain.trim()) return converted.markdown

  if (config.tabular) {
    const table = tabularTextToMarkdown(plain)
    if (table) return table
  }

  if (!canConvertHtml) return null
  converted ??= convertHtml(html)
  if (!converted.markdown || converted.markdown === plain.trim()) return null
  return converted.markdown
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

      if (!view.state.facet(EditorView.editable)) {
        event.preventDefault()
        return true
      }
      const plain = clipboard.getData('text/plain')
      const markdown = richClipboardToMarkdown(plain, clipboard.getData('text/html'), config)
      const replacement = normalizeEmptyListPaste(view.state, markdown ?? plain)
      if (replacement) {
        event.preventDefault()
        view.dispatch({
          changes: replacement,
          selection: { anchor: replacement.from + replacement.insert.length },
          scrollIntoView: true,
          userEvent: 'input.paste',
        })
        return true
      }
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
