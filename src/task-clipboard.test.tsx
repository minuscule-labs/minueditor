import { act, fireEvent, render } from '@testing-library/react'
import { undo } from '@codemirror/commands'
import { EditorSelection, EditorState, StateEffect } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownEditor } from './MarkdownEditor'
import { MarkdownRenderer } from './renderer'

const tasks = '- [ ] Open\n- [/] Partial\n- [x] Done\n  - [/] Nested'

function editor(value: string, options: { source?: boolean; readOnly?: boolean; richPaste?: boolean } = {}) {
  let view!: EditorView
  const onChange = vi.fn()
  const { container } = render(<MarkdownEditor value={value} onChange={onChange} mode={options.source ? 'source' : 'live'} readOnly={options.readOnly ?? false} richPaste={options.richPaste ?? true} onViewReady={next => { view = next }} />)
  return { view, onChange, content: container.querySelector('.cm-content')!, container }
}

function clipboard(content: Element, type: 'copy' | 'cut') {
  const data: Record<string, string> = {}
  fireEvent[type](content, { clipboardData: { setData: (format: string, value: string) => { data[format] = value } } })
  return data['text/plain']
}

function paste(content: Element, plain: string, html = '') {
  fireEvent.paste(content, { clipboardData: { items: [], getData: (type: string) => type === 'text/html' ? html : plain } })
}

describe('task clipboard boundaries', () => {
  it.each([false, true])('copies exact whole task rows and their states (source=%s)', source => {
    const { view, content } = editor(tasks, { source })
    act(() => view.dispatch({ selection: { anchor: tasks.length, head: 0 } }))
    expect(clipboard(content, 'copy')).toBe(tasks)
  })

  it.each([' ', '/', 'x'])('repairs a reverse selection starting inside a hidden [%s] marker', mark => {
    const value = `- [${mark}] Task`
    const { view, content } = editor(value)
    act(() => view.dispatch({ selection: { anchor: value.length, head: 3 } }))
    expect(clipboard(content, 'copy')).toBe(value)
    expect(view.state.doc.toString()).toBe(value)
  })

  it('repairs a selection ending inside a task prefix without adding unselected task text', () => {
    const value = 'Before\n- [/] Task'
    const { view, content } = editor(value)
    act(() => view.dispatch({ selection: { anchor: 0, head: 'Before\n- [/'.length } }))
    expect(clipboard(content, 'copy')).toBe('Before\n- [/] ')
  })

  it('does not add a checkbox when only the task label is deliberately selected', () => {
    const { view, content } = editor('- [/] Task')
    act(() => view.dispatch({ selection: { anchor: 6, head: 10 } }))
    expect(clipboard(content, 'copy')).toBe('Task')
  })

  it('cuts a clipped prefix as complete syntax and undo restores the task state', () => {
    const value = '- [/] Task\nAfter'
    const { view, content } = editor(value)
    act(() => view.dispatch({ selection: { anchor: 10, head: 3 } }))
    expect(clipboard(content, 'cut')).toBe('- [/] Task')
    expect(view.state.doc.toString()).toBe('\nAfter')
    act(() => { expect(undo(view)).toBe(true) })
    expect(view.state.doc.toString()).toBe(value)
  })

  it('keeps raw prefix selections exact in source mode', () => {
    const { view, content } = editor('- [/] Task', { source: true })
    act(() => view.dispatch({ selection: { anchor: 10, head: 3 } }))
    expect(clipboard(content, 'copy')).toBe('/] Task')
  })

  it('does not normalize task-looking code text as a task', () => {
    const value = '```md\n- [/] Task\n```'
    const { view, content } = editor(value)
    const from = value.indexOf('/]')
    act(() => view.dispatch({ selection: { anchor: value.indexOf('\n```'), head: from } }))
    expect(clipboard(content, 'copy')).toBe('/] Task')
  })

  it('keeps indentation and inline formatting when copying a clipped nested task', () => {
    const value = '- Parent\n  - [/] **Nested**'
    const { view, content } = editor(value)
    act(() => view.dispatch({ selection: { anchor: value.length - 1, head: value.indexOf('/]') } }))
    expect(clipboard(content, 'copy')).toBe('  - [/] **Nested**')
  })

  it.each(['copy', 'cut'] as const)('coalesces overlapping repaired task prefixes before %s', type => {
    const { view, content } = editor('- [/] Task')
    act(() => {
      view.dispatch({ effects: StateEffect.appendConfig.of(EditorState.allowMultipleSelections.of(true)) })
      view.dispatch({ selection: EditorSelection.create([EditorSelection.range(2, 3), EditorSelection.range(4, 5)]) })
    })
    expect(clipboard(content, type)).toBe('- [/] ')
    expect(view.state.doc.toString()).toBe(type === 'cut' ? 'Task' : '- [/] Task')
  })

  it('repairs read-only copying without allowing cut to delete tasks', () => {
    const { view, content } = editor('- [/] Task', { readOnly: true })
    act(() => view.dispatch({ selection: { anchor: 10, head: 3 } }))
    expect(clipboard(content, 'copy')).toBe('- [/] Task')
    clipboard(content, 'cut')
    expect(view.state.doc.toString()).toBe('- [/] Task')
  })

  it('normalizes mouse selection while preserving its upward direction', () => {
    const { view, content } = editor('- [/] Task')
    act(() => view.dispatch({ selection: { anchor: 10, head: 3 } }))
    fireEvent.mouseUp(content)
    expect(view.state.selection.main.anchor).toBe(10)
    expect(view.state.selection.main.head).toBe(0)
  })

  it('repairs touch-origin copying without changing the native selection', () => {
    const { view, content } = editor('- [/] Task')
    act(() => view.dispatch({ selection: { anchor: 10, head: 3 } }))
    fireEvent.touchEnd(content)
    expect(clipboard(content, 'copy')).toBe('- [/] Task')
    expect(view.state.selection.main.head).toBe(3)
  })
})

describe('task rich-paste integration', () => {
  it('round-trips rendered HTML checklists with all states and nested labels', () => {
    const rendered = render(<MarkdownRenderer value={tasks} />)
    const html = rendered.container.querySelector('.me-renderer')!.innerHTML
    const { view, content, container } = editor('Before\n\nAfter')
    act(() => view.dispatch({ selection: { anchor: 8, head: 13 } }))
    paste(content, 'Open\nPartial\nDone\n\tNested', html)
    expect(view.state.doc.toString()).toBe('Before\n\n' + tasks)
    expect(container.querySelectorAll('.me-checkbox')).toHaveLength(4)
  })

  it('pastes canonical tab-indented tasks without rewriting their source or creating a table', () => {
    const plain = '- [ ] Parent\n\t- [/] Child'
    const { view, content, container } = editor('')
    paste(content, plain, '<ul><li><input type="checkbox" checked>Different state</li></ul>')
    expect(view.state.doc.toString()).toBe(plain)
    expect(container.querySelector('.me-table-widget')).toBeNull()
  })

  it('uses plain-text paste as an escape hatch even when HTML has checkbox states', () => {
    const { view, content } = editor('')
    fireEvent.keyDown(content, { key: 'v', ctrlKey: true, shiftKey: true })
    paste(content, 'Task', '<ul><li><input type="checkbox" checked>Task</li></ul>')
    expect(view.state.doc.toString()).toBe('Task')
  })

  it('does not mutate a read-only editor when task HTML is pasted', () => {
    const { view, content, onChange } = editor('Original', { readOnly: true })
    paste(content, 'Task', '<ul><li><input type="checkbox" checked>Task</li></ul>')
    expect(view.state.doc.toString()).toBe('Original')
    expect(onChange).not.toHaveBeenCalled()
  })
})
