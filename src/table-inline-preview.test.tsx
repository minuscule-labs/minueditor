import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { MarkdownEditor } from './MarkdownEditor'
import { MarkdownRenderer } from './renderer'

const value = '| **Name** | _Example_ |\n| --- | ---: |\n| **bold _nested_** | `a\\|b` |\n| ~~old~~ | [label](https://example.com) |'

function editor(options: { source?: boolean; readOnly?: boolean; text?: string } = {}) {
  let view!: EditorView
  const onChange = vi.fn()
  const result = render(<MarkdownEditor value={options.text ?? value} onChange={onChange} mode={options.source ? 'source' : 'live'} readOnly={options.readOnly ?? false} onViewReady={next => { view = next }} />)
  return { ...result, view, onChange }
}

describe('inline Markdown in table previews', () => {
  it('formats headers and body cells without rewriting source', () => {
    const { container, view, onChange } = editor()
    expect(container.querySelector('th strong')?.textContent).toBe('Name')
    expect(container.querySelector('th em')?.textContent).toBe('Example')
    expect(container.querySelector('td strong em')?.textContent).toBe('nested')
    expect(container.querySelector('td code')?.textContent).toBe('a|b')
    expect(container.querySelector('td del')?.textContent).toBe('old')
    expect(container.querySelector('.me-table-inline-link')?.textContent).toBe('label')
    expect(container.querySelector('th[data-align="right"]')).not.toBeNull()
    expect(view.state.doc.toString()).toBe(value)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps preview links inert and clicking nested formatting activates editing', async () => {
    const { container } = editor()
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    try {
      expect(container.querySelector('.me-table-render a')).toBeNull()
      fireEvent.mouseDown(container.querySelector('td strong em')!)
      await waitFor(() => expect(container.querySelector('.me-table-input')).toHaveFocus())
      const inputs = container.querySelectorAll<HTMLInputElement>('.me-table-input')
      expect(inputs[0]!.value).toBe('**Name**')
      expect(inputs[3]!.value).toBe('`a|b`')
      expect(open).not.toHaveBeenCalled()
    } finally {
      open.mockRestore()
    }
  })

  it('edits raw Markdown, then re-renders the preview, with undo retaining the original syntax', async () => {
    const { container, view } = editor()
    fireEvent.mouseDown(container.querySelector('.me-table-widget')!)
    const input = await waitFor(() => {
      const field = container.querySelector<HTMLInputElement>('.me-table-input')!
      expect(field).toHaveFocus()
      return field
    })
    fireEvent.input(input, { target: { value: '__Changed__' } })
    expect(view.state.doc.toString()).toContain('| __Changed__ | _Example_ |')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(container.querySelector('th strong')?.textContent).toBe('Changed')
    act(() => { expect(undo(view)).toBe(true) })
    expect(view.state.doc.toString()).toBe(value)
    expect(container.querySelector('th strong')?.textContent).toBe('Name')
  })

  it('updates formatted previews on controlled external changes', () => {
    const { container, rerender, onChange } = editor()
    rerender(<MarkdownEditor value={value.replace('**Name**', '`Updated`')} onChange={onChange} />)
    expect(container.querySelector('th code')?.textContent).toBe('Updated')
    expect(container.querySelector('th strong')).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('formats read-only tables without making cells editable', () => {
    const { container, view } = editor({ readOnly: true })
    expect(container.querySelector('td code')?.textContent).toBe('a|b')
    fireEvent.mouseDown(container.querySelector('td code')!)
    expect(container.querySelector('.me-table-input')).toBeNull()
    expect(view.state.doc.toString()).toBe(value)
  })

  it('leaves source mode literal without table widgets', () => {
    const { container, view } = editor({ source: true })
    expect(container.querySelector('.me-table-widget')).toBeNull()
    expect(view.state.doc.toString()).toBe(value)
    expect(container.querySelector('.cm-content')?.textContent).toContain('**Name**')
  })

  it('keeps raw HTML and image Markdown inert in live previews', () => {
    const text = '| Name | Value |\n| --- | --- |\n| <img src=x onerror=bad> | ![logo](https://example.com/track) |'
    const { container, view } = editor({ text })
    const table = container.querySelector('.me-table-render')!
    expect(table.querySelector('img, script, iframe, [src], [onerror]')).toBeNull()
    expect(table.querySelector('td')?.textContent).toBe('<img src=x onerror=bad>')
    expect(table.querySelectorAll('td')[1]?.textContent).toBe('logo')
    expect(view.state.doc.toString()).toBe(text)
  })

  it('matches the static renderer for supported formatting and escaped-pipe code', () => {
    const { container } = editor()
    const rendered = render(<MarkdownRenderer value={value} />)
    for (const selector of ['th strong', 'th em', 'td strong em', 'td code', 'td del']) {
      expect(container.querySelector(selector)?.textContent).toBe(rendered.container.querySelector(selector)?.textContent)
    }
  })
})
