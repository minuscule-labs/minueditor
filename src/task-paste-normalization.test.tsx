import { act, fireEvent, render } from '@testing-library/react'
import { EditorSelection, EditorState, StateEffect } from '@codemirror/state'
import { undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownEditor } from './MarkdownEditor'

function editor(value: string, options: { source?: boolean; readOnly?: boolean; richPaste?: boolean } = {}) {
  let view!: EditorView
  const { container } = render(<MarkdownEditor value={value} onChange={vi.fn()} mode={options.source ? 'source' : 'live'} readOnly={options.readOnly ?? false} richPaste={options.richPaste ?? true} onViewReady={next => { view = next }} />)
  act(() => view.dispatch({ selection: { anchor: value.length } }))
  return { view, container, content: container.querySelector('.cm-content')! }
}

function paste(content: Element, plain: string, html = '') {
  fireEvent.paste(content, { clipboardData: { items: [], getData: (type: string) => type === 'text/html' ? html : plain } })
}

const pasted = '- [/] **Pasted**'

describe('paste into an empty live list item', () => {
  it('replaces the prefix created by Enter with the pasted task and keeps undo separate', () => {
    const original = '- [x] Existing'
    const { view, content, container } = editor(original)
    fireEvent.keyDown(content, { key: 'Enter' })
    expect(view.state.doc.toString()).toBe(original + '\n- [ ] ')
    paste(content, pasted)
    expect(view.state.doc.toString()).toBe(original + '\n' + pasted)
    expect(container.querySelectorAll('.me-checkbox')).toHaveLength(2)
    expect(container.querySelectorAll('.me-checkbox')[1]).toHaveAttribute('aria-checked', 'mixed')
    act(() => { expect(undo(view)).toBe(true) })
    expect(view.state.doc.toString()).toBe(original + '\n- [ ] ')
  })

  it.each([' ', '/', 'x', 'X'])('adopts the pasted [%s] state, not the empty destination state', mark => {
    const { view, content } = editor('- [x] ')
    paste(content, `+ [${mark}] Work`)
    expect(view.state.doc.toString()).toBe(`+ [${mark}] Work`)
    expect(view.state.selection.main.head).toBe(view.state.doc.length)
  })

  it.each(['- ', '2. ', '- [ ] '].flatMap(destination =>
    ['* Bullet', '7) Numbered', '+ [/] Task'].map(fragment => [destination, fragment] as const),
  ))('adopts the pasted prefix in an empty %s item: %s', (destination, fragment) => {
    const { view, content } = editor(destination)
    paste(content, fragment)
    expect(view.state.doc.toString()).toBe(fragment)
  })

  it('adopts ordered task markers without renumbering surrounding items', () => {
    const { view, content } = editor('1. Before\n2. \n3. After')
    act(() => view.dispatch({ selection: { anchor: '1. Before\n2. '.length } }))
    paste(content, '7. [x] Pasted')
    expect(view.state.doc.toString()).toBe('1. Before\n7. [x] Pasted\n3. After')
  })

  it.each([
    ['- Previous', '- '],
    ['1. Previous', '2. '],
  ])('normalizes after Enter in %s and keeps undo separate', (original, empty) => {
    const { view, content } = editor(original)
    fireEvent.keyDown(content, { key: 'Enter' })
    expect(view.state.doc.toString()).toBe(original + '\n' + empty)
    paste(content, '* Pasted')
    expect(view.state.doc.toString()).toBe(original + '\n* Pasted')
    act(() => { expect(undo(view)).toBe(true) })
    expect(view.state.doc.toString()).toBe(original + '\n' + empty)
  })

  it('preserves tab-indented list Markdown instead of converting it to TSV', () => {
    const { view, content } = editor('- ')
    paste(content, '- Parent\n\t- Child')
    expect(view.state.doc.toString()).toBe('- Parent\n\t- Child')
  })

  it('leaves ambiguous tab alignment on the raw path rather than changing code indentation', () => {
    const value = '- Parent\n  - '
    const fragment = '- Child\n\t\tcode'
    const { view, content } = editor(value)
    paste(content, fragment)
    expect(view.state.doc.toString()).toBe(value + fragment)
  })

  it('handles a caret within trailing whitespace without losing neighboring rows', () => {
    const { view, content } = editor('- [ ]   \n- [x] After')
    act(() => view.dispatch({ selection: { anchor: 6 } }))
    paste(content, pasted)
    expect(view.state.doc.toString()).toBe(pasted + '\n- [x] After')
  })

  it('handles an empty task with no trailing space', () => {
    const { view, content } = editor('- [ ]')
    paste(content, pasted)
    expect(view.state.doc.toString()).toBe(pasted)
  })

  it('preserves relative nesting while adapting copied indentation to the destination', () => {
    const { view, content } = editor('- [ ] Parent\n  - [ ] ')
    paste(content, '    - [/] Child\n      - [x] Grandchild\n    - [ ] Sibling')
    expect(view.state.doc.toString()).toBe('- [ ] Parent\n  - [/] Child\n    - [x] Grandchild\n  - [ ] Sibling')
  })

  it('dedents a copied nested task when pasted into an empty top-level task', () => {
    const { view, content } = editor('- [ ] ')
    paste(content, '  - [/] Child\n    - [x] Grandchild')
    expect(view.state.doc.toString()).toBe('- [/] Child\n  - [x] Grandchild')
  })

  it('also normalizes converted HTML checklist fragments', () => {
    const { view, content } = editor('- [ ] Parent\n  - [ ] ')
    paste(content, 'Work\n\tChild', '<ul><li><span role="checkbox" aria-checked="mixed"></span><strong>Work</strong><ul><li><input type="checkbox" checked>Child</li></ul></li></ul>')
    expect(view.state.doc.toString()).toBe('- [ ] Parent\n  - [/] **Work**\n    - [x] Child')
  })

  it.each([
    ['<ul><li>Parent<ul><li>Child</li></ul></li></ul>', '- Parent\n  - Child'],
    ['<ol><li>Parent<ol><li>Child</li></ol></li></ol>', '1. Parent\n   1. Child'],
  ])('normalizes nested HTML lists without treating indentation tabs as TSV: %s', (html, expected) => {
    const { view, content } = editor('2. ')
    paste(content, 'Parent\n\tChild', html)
    expect(view.state.doc.toString()).toBe(expected)
  })

  it('normalizes CRLF task fragments to editor line breaks', () => {
    const { view, content } = editor('- [ ] ')
    paste(content, '- [/] Work\r\n  - [x] Child\r\n')
    expect(view.state.doc.toString()).toBe('- [/] Work\n  - [x] Child\n')
  })

  it.each([
    ['label-only text', '- [ ] ', 'Label', '- [ ] Label'],
    ['a nonempty item', '- [ ] Existing', pasted, '- [ ] Existing' + pasted],
    ['a thematic break', '- [ ] ', '- - -', '- [ ] - - -'],
    ['a star thematic break', '- [ ] ', '* * *', '- [ ] * * *'],
    ['an invalid ordered marker', '- [ ] ', '1234567890. Work', '- [ ] 1234567890. Work'],
    ['an indented code checkbox inside a list', '-     [ ] ', pasted, '-     [ ] ' + pasted],
    ['a nonempty ordinary bullet', '- Existing', '- Pasted', '- Existing- Pasted'],
    ['a nonempty ordered item', '1. Existing', '7. Pasted', '1. Existing7. Pasted'],
    ['a fenced task-looking line', '```md\n- [ ] ', pasted, '```md\n- [ ] ' + pasted],
    ['a quote', '> - [ ] ', pasted, '> - [ ] ' + pasted],
    ['a fragment with leading prose', '- [ ] ', 'Intro\n' + pasted, '- [ ] Intro\n' + pasted],
    ['a fragment with inconsistent base indentation', '- [ ] ', '  - [/] Child\n- [x] Parent', '- [ ]   - [/] Child\n- [x] Parent'],
  ])('leaves %s on the existing paste path', (_name, value, plain, expected) => {
    const { view, content } = editor(value)
    paste(content, plain)
    expect(view.state.doc.toString()).toBe(expected)
  })

  it.each([{ source: true }, { richPaste: false }])('retains raw insertion when normalization is disabled: %s', options => {
    const { view, content } = editor('- [ ] ', options)
    paste(content, pasted)
    expect(view.state.doc.toString()).toBe('- [ ] ' + pasted)
  })

  it('retains raw insertion for the explicit plain-text paste gesture', () => {
    const { view, content } = editor('- [ ] ')
    fireEvent.keyDown(content, { key: 'v', ctrlKey: true, shiftKey: true })
    paste(content, pasted)
    expect(view.state.doc.toString()).toBe('- [ ] ' + pasted)
  })

  it('does not change read-only documents', () => {
    const { view, content } = editor('- [ ] ', { readOnly: true })
    paste(content, pasted)
    expect(view.state.doc.toString()).toBe('- [ ] ')
  })

  it('does not normalize a nonempty selection', () => {
    const { view, content } = editor('- [ ] ')
    act(() => view.dispatch({ selection: { anchor: 5, head: 6 } }))
    paste(content, pasted)
    expect(view.state.doc.toString()).toBe('- [ ]' + pasted)
  })

  it('does not normalize a caret inside hidden checkbox syntax', () => {
    const { view, content } = editor('- [ ] ')
    act(() => view.dispatch({ selection: { anchor: 3 } }))
    paste(content, pasted)
    expect(view.state.doc.toString()).toBe('- [' + pasted + ' ] ')
  })

  it('does not normalize multiple carets', () => {
    const { view, content } = editor('- [ ] \n- [ ] ')
    act(() => {
      view.dispatch({ effects: StateEffect.appendConfig.of(EditorState.allowMultipleSelections.of(true)) })
      view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(6), EditorSelection.cursor(13)]) })
    })
    paste(content, pasted)
    expect(view.state.doc.toString()).toBe('- [ ] ' + pasted + '\n- [ ] ' + pasted)
  })
})
