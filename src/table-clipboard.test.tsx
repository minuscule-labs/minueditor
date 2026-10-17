import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownEditor } from './MarkdownEditor'

const source = '| Name | Example |\n| --- | --- |\n| Ada | `a  b` |\n| Grace | **bold** |\n|  |  |'

type Clipboard = Record<string, string>

function dispatchClipboard(element: Element, type: 'copy' | 'cut' | 'paste', values: Clipboard = {}) {
  const data = { ...values }
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clipboardData', { value: {
    getData: (format: string) => data[format] ?? '',
    setData: (format: string, value: string) => { data[format] = value },
    clearData: () => { for (const key of Object.keys(data)) delete data[key] },
  } })
  act(() => { element.dispatchEvent(event) })
  return { event, data }
}

async function editor(text = source) {
  let view!: EditorView
  const result = render(<MarkdownEditor value={text} onChange={vi.fn()} onViewReady={next => { view = next }} />)
  fireEvent.mouseDown(result.container.querySelector('.me-table-widget')!)
  await waitFor(() => expect(result.container.querySelector('.me-table-input')).toHaveFocus())
  const cell = (row: number, column: number) => result.container.querySelector<HTMLInputElement>(
    `.me-table-input[data-row-index="${row}"][data-col-index="${column}"]`,
  )!
  return { ...result, view, cell }
}

function selectRange(first: HTMLInputElement, last: HTMLInputElement) {
  fireEvent.click(first)
  fireEvent.click(last, { shiftKey: true })
}

describe('table clipboard ownership and range round trips', () => {
  it.each(['copy', 'cut'] as const)('leaves native cell-text %s alone without leaking to the document', async type => {
    const { view, cell } = await editor()
    const input = cell(1, 0)
    act(() => { input.focus(); input.setSelectionRange(0, 2) })
    const parent = vi.fn()
    view.contentDOM.addEventListener(type, parent)
    const { event, data } = dispatchClipboard(input, type)
    expect(parent).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
    expect(data).toEqual({})
    expect(input.value).toBe('Ada')
    expect(view.state.doc.toString()).toBe(source)
  })

  it('copies a one-column rectangle with HTML and pastes it back as rows', async () => {
    const { view, cell } = await editor()
    selectRange(cell(1, 0), cell(2, 0))
    const copied = dispatchClipboard(cell(2, 0), 'copy')
    expect(copied.event.defaultPrevented).toBe(true)
    expect(copied.data['text/plain']).toBe('Ada\nGrace')
    expect(copied.data['text/html']).toContain('<table>')
    fireEvent.click(cell(3, 0))
    const pasted = dispatchClipboard(cell(3, 0), 'paste', copied.data)
    expect(pasted.event.defaultPrevented).toBe(true)
    expect(view.state.doc.toString()).toBe(source.replace('|  |  |', '| Ada |  |\n| Grace |  |'))
    act(() => { expect(undo(view)).toBe(true) })
    expect(view.state.doc.toString()).toBe(source)
  })

  it('round-trips a selected single cell without losing inline-code spacing', async () => {
    const { view, cell } = await editor()
    selectRange(cell(1, 1), cell(1, 1))
    const { data } = dispatchClipboard(cell(1, 1), 'copy')
    expect(data['text/plain']).toBe('`a  b`')
    fireEvent.click(cell(3, 1))
    dispatchClipboard(cell(3, 1), 'paste', data)
    expect(view.state.doc.toString()).toContain('|  | `a  b` |')
  })

  it('cuts a selected column atomically while preserving the header, with undo intact', async () => {
    const { view, cell } = await editor()
    selectRange(cell(1, 0), cell(2, 0))
    const { data, event } = dispatchClipboard(cell(2, 0), 'cut')
    expect(event.defaultPrevented).toBe(true)
    expect(data['text/plain']).toBe('Ada\nGrace')
    expect(data['text/html']).toContain('<table>')
    expect(view.state.doc.toString()).toBe(source.replace('| Ada |', '|  |').replace('| Grace |', '|  |'))
    act(() => { expect(undo(view)).toBe(true) })
    expect(view.state.doc.toString()).toBe(source)
  })

  it('still requires overwrite confirmation for a copied single-column range', async () => {
    const { container, view, cell } = await editor()
    selectRange(cell(1, 0), cell(2, 0))
    const { data } = dispatchClipboard(cell(2, 0), 'copy')
    fireEvent.click(cell(1, 1))
    dispatchClipboard(cell(1, 1), 'paste', data)
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull()
    expect(view.state.doc.toString()).toBe(source)
    fireEvent.click(container.querySelector('[aria-label="Confirm table paste"] button:last-child')!)
    expect(view.state.doc.toString()).toContain('| Ada | Ada |\n| Grace | Grace |')
  })

  it('does not reinterpret ambiguous plain multiline text as a column', async () => {
    const { container, view, cell } = await editor()
    const { event } = dispatchClipboard(cell(3, 0), 'paste', { 'text/plain': 'first\nsecond' })
    expect(event.defaultPrevented).toBe(true)
    expect(container.querySelector('[data-table-status]')).toHaveTextContent('Multiline text is unsupported')
    expect(view.state.doc.toString()).toBe(source)
  })

  it('rejects merged HTML without changing source', async () => {
    const { container, view, cell } = await editor()
    dispatchClipboard(cell(3, 0), 'paste', {
      'text/html': '<table><tr><td colspan="2">A</td><td>B</td></tr></table>',
    })
    expect(container.querySelector('[data-table-status]')).toHaveTextContent('merged cells')
    expect(view.state.doc.toString()).toBe(source)
  })
})
