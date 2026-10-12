import { describe, expect, it, vi } from 'vitest'
import { Lexer } from 'marked'
import { renderInlineTableCell } from './table-inline-markdown'

function cell(source: string) {
  const element = document.createElement('td')
  element.append(renderInlineTableCell(source, document))
  return element
}

describe('safe inline table previews', () => {
  it.each([
    ['**bold**', 'strong', 'bold'],
    ['__bold__', 'strong', 'bold'],
    ['*italic*', 'em', 'italic'],
    ['_italic_', 'em', 'italic'],
    ['~~old~~', 'del', 'old'],
    ['`code`', 'code', 'code'],
    ['``a ` b``', 'code', 'a ` b'],
    ['`a|b`', 'code', 'a|b'],
    ['`a  b`', 'code', 'a  b'],
    ['`<img src=x>`', 'code', '<img src=x>'],
    ['`&lt;b&gt;`', 'code', '&lt;b&gt;'],
  ])('renders %s as %s', (source, tag, text) => {
    const element = cell(source)
    expect(element.querySelector(tag)?.textContent).toBe(text)
    expect(element.textContent).toBe(text)
  })

  it('supports nested formatting and multiple independent spans', () => {
    const element = cell('**bold _italic_** and ~~old~~ `new`')
    expect(element.querySelector('strong em')?.textContent).toBe('italic')
    expect(element.textContent).toBe('bold italic and old new')
  })

  it.each([
    ['\\*literal\\*', '*literal*'],
    ['**unfinished', '**unfinished'],
    ['[reference][missing]', '[reference][missing]'],
    ['[[wiki]]', '[[wiki]]'],
    ['- [/] task', '- [/] task'],
    ['&lt;tag&gt; &amp; &#34;quote&#34;', '<tag> & "quote"'],
  ])('keeps literal content readable: %s', (source, text) => {
    expect(cell(source).textContent).toBe(text)
  })

  it.each([
    '<script>alert(1)</script>',
    '<img src="https://example.com/track" onerror="alert(1)">',
    '<svg onload="alert(1)"><a href="javascript:bad">text</a></svg>',
    '<iframe src="https://example.com"></iframe>',
    '<b>literal</b>',
  ])('keeps raw HTML inert and literal: %s', source => {
    const element = cell(source)
    expect(element.textContent).toBe(source)
    expect(element.children).toHaveLength(0)
  })

  it.each(['https://example.com', 'javascript:alert(1)', 'data:text/html,bad', '/local', '#heading'])('renders link labels without navigation: %s', href => {
    const element = cell(`[**label**](${href})`)
    expect(element.querySelector('.me-table-inline-link strong')?.textContent).toBe('label')
    expect(element.querySelector('a, [href], [tabindex]')).toBeNull()
  })

  it('shows image alt text without loading assets or rendering label HTML', () => {
    const element = cell('![**logo** `v2`](https://example.com/track)')
    expect(element.textContent).toBe('logo v2')
    expect(element.querySelector('img, [src], strong, code')).toBeNull()
  })

  it('keeps image source discoverable when no readable alt text is available', () => {
    const source = '![](https://example.com/track)'
    expect(cell(source).textContent).toBe(source)
    expect(cell(source).querySelector('img')).toBeNull()
  })

  it('falls back to literal source if inline parsing fails', () => {
    const mock = vi.spyOn(Lexer, 'lexInline').mockImplementationOnce(() => { throw new Error('bad input') })
    try {
      const source = '**unfinished** <img src=x onerror=bad>'
      const element = cell(source)
      expect(element.textContent).toBe(source)
      expect(element.children).toHaveLength(0)
    } finally {
      mock.mockRestore()
    }
  })
})
