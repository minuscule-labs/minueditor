import { describe, expect, it } from 'vitest'
import { htmlToMarkdown, richClipboardToMarkdown } from './rich-paste'

const checklist = '<ul><li><input type="checkbox">Open</li><li><span role="checkbox" aria-checked="mixed"></span>Partial</li><li><input type="checkbox" checked>Done</li></ul>'
const markdown = '- [ ] Open\n- [/] Partial\n- [x] Done'

describe('task-list HTML conversion', () => {
  it('preserves empty, partial, and checked states as portable task markers', () => {
    expect(htmlToMarkdown(checklist)).toBe(markdown)
  })

  it.each([
    ['<input type="checkbox">', '[ ]'],
    ['<input type="checkbox" checked disabled>', '[x]'],
    ['<input type="checkbox" aria-checked="mixed">', '[/]'],
    ['<span role="checkbox" aria-checked="false"></span>', '[ ]'],
    ['<button role="checkbox" aria-checked="true">✓</button>', '[x]'],
    ['<span role="checkbox" aria-checked="mixed">−</span>', '[/]'],
  ])('recognizes a leading semantic checkbox: %s', (control, marker) => {
    expect(htmlToMarkdown(`<ul><li>${control} Task</li></ul>`)).toBe(`- ${marker} Task`)
  })

  it('finds leading controls through presentation wrappers and preserves formatted labels', () => {
    const html = '<ul><li> \n<p><label><span><input type="checkbox" checked></span> <strong>Ship</strong> <code>release</code></label></p></li></ul>'
    expect(htmlToMarkdown(html)).toBe('- [x] **Ship** `release`')
  })

  it('preserves parent/child task states without using a child checkbox for its parent', () => {
    const html = '<ul><li>Parent<ul><li><input type="checkbox" checked>Child</li></ul></li><li><input type="checkbox">Task parent<ul><li><span role="checkbox" aria-checked="mixed"></span>Nested</li></ul></li></ul>'
    expect(htmlToMarkdown(html)).toBe('- Parent\n  - [x] Child\n- [ ] Task parent\n  - [/] Nested')
  })

  it('ignores comments before a leading control', () => {
    expect(htmlToMarkdown('<ul><li><!-- React --> <input type="checkbox" checked>Task</li></ul>')).toBe('- [x] Task')
  })

  it('preserves labels inside ARIA checkbox controls, including nested task lists', () => {
    const html = '<ul><li><label role="checkbox" aria-checked="mixed">Read <strong>docs</strong><ul><li><input type="checkbox" checked>Child</li></ul></label></li><li role="checkbox" aria-checked="true">Whole item</li></ul>'
    expect(htmlToMarkdown(html)).toBe('- [/] Read **docs**\n  - [x] Child\n- [x] Whole item')
  })

  it('preserves formatting when the ARIA control is itself a formatting element', () => {
    expect(htmlToMarkdown('<ul><li><strong role="checkbox" aria-checked="true">Bold label</strong></li></ul>')).toBe('- [x] **Bold label**')
  })

  it('uses enough indentation for nested items beneath wide ordered markers', () => {
    const leading = Array.from({ length: 9 }, (_, index) => `<li>Item ${index + 1}</li>`).join('')
    const html = `<ol>${leading}<li>Parent<ul><li><span role="checkbox" aria-checked="mixed"></span>Child</li></ul></li></ol>`
    expect(htmlToMarkdown(html)).toBe(Array.from({ length: 9 }, (_, index) => `${index + 1}. Item ${index + 1}`).join('\n') + '\n10. Parent\n    - [/] Child')
  })

  it('retains ordered-list structure when importing an ordered checklist', () => {
    expect(htmlToMarkdown('<ol><li><input type="checkbox" checked>First</li><li><input type="checkbox">Second</li></ol>')).toBe('1. [x] First\n2. [ ] Second')
  })

  it.each([
    ['<ul><li>Text <input type="checkbox" checked></li></ul>', '- Text'],
    ['<ul><li><span role="checkbox" aria-checked="unknown">Icon</span> text</li></ul>', '- Icon text'],
    ['<ul><li><span class="checked">Icon</span> text</li></ul>', '- Icon text'],
    ['<ul><li><input type="radio" checked>Text</li></ul>', '- Text'],
    ['<p><input type="checkbox" checked>Text</p>', 'Text'],
    ['<ul><li><script role="checkbox" aria-checked="true">bad()</script>Text</li></ul>', '- Text'],
    ['<ul><li><template role="checkbox" aria-checked="true">Hidden</template>Text</li></ul>', '- Text'],
    ['<ul><li><ul role="checkbox" aria-checked="true"><li>Child</li></ul></li></ul>', '-\n  - Child'],
  ])('does not infer tasks from unrelated controls or appearance: %s', (html, expected) => {
    expect(htmlToMarkdown(html)).toBe(expected)
  })

  it('continues to drop active content and unsafe links inside task labels', () => {
    const html = '<ul><li><input type="checkbox" checked><script>alert(1)</script><a href="javascript:alert(1)">Safe label</a><img src="https://example.com/track"></li></ul>'
    expect(htmlToMarkdown(html)).toBe('- [x] Safe label')
  })
})

describe('task clipboard precedence', () => {
  it('preserves explicit task Markdown even when HTML disagrees', () => {
    expect(richClipboardToMarkdown(markdown, '<ul><li><input type="checkbox" checked>Changed</li></ul>')).toBeNull()
  })

  it('preserves tab-indented task Markdown instead of turning it into a table', () => {
    const plain = '- [ ] Parent\n\t- [/] Child'
    expect(richClipboardToMarkdown(plain, checklist)).toBeNull()
  })

  it('preserves empty tab-indented task rows with CRLF line endings', () => {
    expect(richClipboardToMarkdown('- [ ]\r\n\t- [/]\r\n', checklist)).toBeNull()
  })

  it('preserves quoted and ordered task Markdown with tabs', () => {
    expect(richClipboardToMarkdown('> 1. [x] Parent\n>\t- [ ] Child', checklist)).toBeNull()
  })

  it('recovers semantic HTML task states before treating plain-text indentation as TSV', () => {
    const html = '<ul><li><input type="checkbox">Parent<ul><li><span role="checkbox" aria-checked="mixed"></span>Child</li></ul></li></ul>'
    expect(richClipboardToMarkdown('Parent\n\tChild', html)).toBe('- [ ] Parent\n  - [/] Child')
  })

  it('retains the existing Markdown-first policy for ordinary Markdown-looking plain text', () => {
    expect(richClipboardToMarkdown('- Open\n- Partial\n- Done', checklist)).toBeNull()
  })

  it('imports HTML tasks from ordinary browser text', () => {
    expect(richClipboardToMarkdown('Open\nPartial\nDone', checklist)).toBe(markdown)
  })

  it('respects disabled HTML and rich-paste conversion', () => {
    expect(richClipboardToMarkdown('Open', checklist, { html: false })).toBeNull()
    expect(richClipboardToMarkdown('Open', checklist, false)).toBeNull()
  })

  it('does not let checkbox-looking code or suppressed HTML override TSV', () => {
    const plain = 'Name\tStatus\nTask\tReady'
    for (const html of ['<pre><ul><li><input type="checkbox" checked>Code</li></ul></pre>', '<template><ul><li><input type="checkbox" checked>Hidden</li></ul></template>']) {
      expect(richClipboardToMarkdown(plain, html)).toBe('| Name | Status |\n| --- | --- |\n| Task | Ready |')
    }
  })

  it('keeps the existing TSV path when the HTML has no leading task controls', () => {
    expect(richClipboardToMarkdown('Name\tStatus\nTask\tReady', '<p>Table</p>')).toBe('| Name | Status |\n| --- | --- |\n| Task | Ready |')
  })
})
