import { act, fireEvent, render } from '@testing-library/react'
import { EditorSelection, EditorState, StateEffect } from '@codemirror/state'
import { undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownEditor } from './MarkdownEditor'

function editor(value: string, readOnly = false) {
  let view!: EditorView
  const onChange = vi.fn()
  const { container } = render(
    <MarkdownEditor value={value} onChange={onChange} readOnly={readOnly} onViewReady={next => { view = next }} />,
  )
  return { view, onChange, content: container.querySelector('.cm-content')! }
}

function clipboardEvent(content: Element, type: 'copy' | 'cut') {
  const data: Record<string, string> = {}
  fireEvent[type](content, {
    clipboardData: { setData: (format: string, value: string) => { data[format] = value } },
  })
  return data['text/plain']
}

describe('formatted Markdown clipboard', () => {
  it.each(['forward', 'backward'])('copies a complete bold span with a clipped closing marker (%s)', direction => {
    const { view, content } = editor('**bold** after')
    act(() => view.dispatch({ selection: direction === 'forward' ? { anchor: 2, head: 7 } : { anchor: 7, head: 2 } }))
    expect(clipboardEvent(content, 'copy')).toBe('**bold**')
    expect(view.state.doc.toString()).toBe('**bold** after')
  })

  it('repairs an upward multiline selection starting inside an opening marker', () => {
    const value = '**bold** starts here.\nContinue below.'
    const { view, content } = editor(value)
    act(() => view.dispatch({ selection: { anchor: value.length, head: 1 } }))
    expect(clipboardEvent(content, 'copy')).toBe(value)
  })

  it('keeps reverse mouse-selection direction while restoring complete markers', () => {
    const { view, content } = editor('***bold italic*** after')
    act(() => view.dispatch({ selection: { anchor: 15, head: 2 } }))
    fireEvent.mouseUp(content)
    expect(view.state.selection.main.anchor).toBe(17)
    expect(view.state.selection.main.head).toBe(0)
    expect(clipboardEvent(content, 'copy')).toBe('***bold italic***')
  })

  it('cuts the same complete span it copies, leaves adjacent text intact, and supports undo', () => {
    const { view, content, onChange } = editor('Before __bold__ after')
    act(() => view.dispatch({ selection: { anchor: 14, head: 8 } }))
    expect(clipboardEvent(content, 'cut')).toBe('__bold__')
    expect(view.state.doc.toString()).toBe('Before  after')
    expect(onChange).toHaveBeenLastCalledWith('Before  after')
    act(() => { expect(undo(view)).toBe(true) })
    expect(view.state.doc.toString()).toBe('Before __bold__ after')
  })

  it('copies in read-only mode but does not cut', () => {
    const { view, content } = editor('**bold**', true)
    act(() => view.dispatch({ selection: { anchor: 7, head: 1 } }))
    expect(clipboardEvent(content, 'copy')).toBe('**bold**')
    clipboardEvent(content, 'cut')
    expect(view.state.doc.toString()).toBe('**bold**')
  })

  it.each(['copy', 'cut'] as const)('coalesces overlapping expanded selections before %s', type => {
    const { view, content } = editor('**two words** after')
    act(() => {
      view.dispatch({ effects: StateEffect.appendConfig.of(EditorState.allowMultipleSelections.of(true)) })
      view.dispatch({ selection: EditorSelection.create([EditorSelection.range(2, 4), EditorSelection.range(6, 9)]) })
    })
    expect(view.state.selection.ranges).toHaveLength(2)
    expect(clipboardEvent(content, type)).toBe('**two words**')
    expect(view.state.doc.toString()).toBe(type === 'cut' ? ' after' : '**two words** after')
  })
})
