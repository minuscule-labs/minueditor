import { Lexer, type Token } from 'marked'
import { decodeHTMLStrict } from 'entities/decode'

function renderTokens(tokens: Token[], doc: Document, depth = 0): DocumentFragment {
  const fragment = doc.createDocumentFragment()
  for (const token of tokens) {
    if (depth > 32) {
      fragment.append(doc.createTextNode(token.raw))
    } else if (token.type === 'strong' || token.type === 'em' || token.type === 'del') {
      const element = doc.createElement(token.type)
      element.append(renderTokens(token.tokens ?? [], doc, depth + 1))
      fragment.append(element)
    } else if (token.type === 'codespan') {
      const code = doc.createElement('code')
      code.className = 'me-inline-code'
      code.textContent = token.text
      fragment.append(code)
    } else if (token.type === 'link') {
      // The table remains click-to-edit. No anchors, URL navigation, resource
      // resolution, or extra tab stops are introduced by its inline preview.
      const label = doc.createElement('span')
      label.className = 'me-link me-table-inline-link'
      const content = renderTokens(token.tokens ?? [], doc, depth + 1)
      label.append(content.textContent?.trim() ? content : doc.createTextNode(token.raw))
      fragment.append(label)
    } else if (token.type === 'image') {
      // Show alt text without fetching an image or introducing active content.
      const alt = token.tokens ? renderTokens(token.tokens, doc, depth + 1).textContent : decodeHTMLStrict(token.text)
      fragment.append(doc.createTextNode(alt?.trim() ? alt : token.raw))
    } else if (token.type === 'text' || token.type === 'escape') {
      fragment.append(doc.createTextNode(decodeHTMLStrict(token.text)))
    } else {
      // Raw HTML and unsupported syntax stay literal. Never set innerHTML or
      // copy user-supplied elements, attributes, event handlers, or destinations.
      fragment.append(doc.createTextNode(token.raw))
    }
  }
  return fragment
}

/** Safe, display-only inline Markdown for an inactive table cell. */
export function renderInlineTableCell(source: string, doc: Document): DocumentFragment {
  try {
    return renderTokens(Lexer.lexInline(source, { gfm: true }), doc)
  } catch {
    const fragment = doc.createDocumentFragment()
    fragment.append(doc.createTextNode(source))
    return fragment
  }
}
