import { act, fireEvent, render } from '@testing-library/react'
import { EditorSelection, EditorState, StateEffect } from '@codemirror/state'
import { undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownEditor } from './MarkdownEditor'
import { findCalloutBlocks } from './extensions/callouts'
import { enterInCallout } from './extensions/callout-editing'

function editor(value: string, options: { source?: boolean; readOnly?: boolean; onSubmit?: () => void } = {}) {
  let view!: EditorView
  render(<MarkdownEditor value={value} onChange={vi.fn()} mode={options.source ? 'source' : 'live'} readOnly={options.readOnly ?? false} {...(options.onSubmit ? { onSubmit: options.onSubmit } : {})} onViewReady={next => { view = next }} />)
  act(() => {
    view.dispatch({ selection: { anchor: value.length } })
    view.focus()
  })
  return view
}

function enter(view: EditorView, shiftKey = false) {
  act(() => { fireEvent.keyDown(view.contentDOM, { key: 'Enter', code: 'Enter', keyCode: 13, shiftKey }) })
}

function modEnter(view: EditorView) {
  const mac = /Mac|iP(hone|ad|od)/.test(navigator.platform)
  act(() => { fireEvent.keyDown(view.contentDOM, { key: 'Enter', code: 'Enter', metaKey: mac, ctrlKey: !mac }) })
}

describe('live callout editing', () => {
  it('continues body text, then exits on the first empty quoted line', () => {
    const value = '> [!NOTE]\n> Body text.'
    const view = editor(value)
    enter(view)
    expect(view.state.doc.toString()).toBe(value + '\n> ')
    enter(view)
    expect(view.state.doc.toString()).toBe(value + '\n\n')
    expect(view.state.selection.main.head).toBe(view.state.doc.length)
    act(() => view.dispatch(view.state.replaceSelection('After the callout.')))
    expect(findCalloutBlocks(view.state)[0]?.to).toBe(value.length)
  })

  it.each(['**body**', '*body*', '__body__', '~~body~~', '`body`', '***body***', '**outer *body***', '``body ` code``', '[body](https://example.com)'])('continues after the closing formatting in %s without splitting its syntax', formatted => {
    const value = '> [!TIP]\n> ' + formatted
    const view = editor(value)
    const cursor = formatted.startsWith('``') ? value.indexOf('code') + 4 : value.indexOf('body') + 4
    act(() => view.dispatch({ selection: { anchor: cursor } }))
    enter(view)
    expect(view.state.doc.toString()).toBe(value + '\n> ')
    expect(view.state.selection.main.head).toBe(view.state.doc.length)
  })

  it('preserves native quoted-list continuation before exiting the callout', () => {
    const value = '> [!NOTE]\n> - **item**'
    const view = editor(value)
    act(() => view.dispatch({ selection: { anchor: value.indexOf('item') + 4 } }))
    enter(view)
    expect(view.state.doc.toString()).toBe(value + '\n> - ')
    enter(view)
    // Markdown first makes this two-item list loose, then unwraps the empty item.
    expect(view.state.doc.toString()).toBe(value + '\n>\n> - ')
    enter(view)
    expect(view.state.doc.toString()).toBe(value + '\n>\n> ')
    enter(view)
    expect(view.state.doc.toString()).toBe(value + '\n>\n\n')
  })

  it('leaves nested quote and enclosing-list exits on their native paths', () => {
    const nested = editor('> [!NOTE]\n> > Nested\n> > ')
    enter(nested)
    expect(nested.state.doc.toString()).toBe('> [!NOTE]\n> > Nested\n> >\n> > ')
    const list = editor('- Parent\n  > [!NOTE]\n  > Body\n  > ')
    expect(enterInCallout(list)).toBe(false)
  })

  it.each(['> [!NOTE]\n> ```md\n> **literal**\n> ```', '> [!NOTE]\n> <div>\n> text\n> </div>'])('does not override code or HTML blocks inside a callout: %s', value => {
    const view = editor(value)
    act(() => view.dispatch({ selection: { anchor: view.state.doc.line(3).to } }))
    expect(enterInCallout(view)).toBe(false)
    expect(enterInCallout(view, true)).toBe(false)
    expect(view.state.doc.toString()).toBe(value)
  })

  it('keeps blank lines inside a callout with Shift+Enter', () => {
    const value = '> [!NOTE]\n> First paragraph.'
    const view = editor(value)
    enter(view)
    enter(view, true)
    enter(view, true)
    expect(view.state.doc.toString()).toBe(value + '\n> \n> \n> ')
    act(() => view.dispatch(view.state.replaceSelection('Next paragraph.')))
    expect(findCalloutBlocks(view.state)).toHaveLength(1)
    expect(findCalloutBlocks(view.state)[0]?.endLine).toBe(5)
  })

  it('uses Shift+Enter after formatted body text without splitting closing markers', () => {
    const value = '> [!NOTE]\n> **body**'
    const view = editor(value)
    act(() => view.dispatch({ selection: { anchor: value.indexOf('body') + 4 } }))
    enter(view, true)
    expect(view.state.doc.toString()).toBe(value + '\n> ')
  })

  it('keeps a blank quoted line when Shift+Enter starts just after the quote marker', () => {
    const view = editor('> [!NOTE]\n> Body\n>  ')
    act(() => view.dispatch({ selection: { anchor: view.state.doc.line(3).from + 1 } }))
    enter(view, true)
    expect(view.state.doc.toString()).toBe('> [!NOTE]\n> Body\n>\n>   ')
  })

  it('does not change Shift+Enter in ordinary prose or source mode', () => {
    const prose = editor('Ordinary text')
    enter(prose, true)
    expect(prose.state.doc.toString()).toBe('Ordinary text\n')
    const source = editor('> [!NOTE]\n> Body', { source: true })
    enter(source, true)
    expect(source.state.doc.toString()).toBe('> [!NOTE]\n> Body\n')
  })

  it('exits an empty callout body without deleting its header', () => {
    const view = editor('> [!NOTE]\n> ')
    enter(view)
    expect(view.state.doc.toString()).toBe('> [!NOTE]\n\n')
  })

  it('parses a distant callout before applying the empty-line exit', () => {
    const prefix = 'Ordinary paragraph.\n\n'.repeat(500)
    const view = editor(prefix + '> [!TIP]\n> Body\n> ')
    enter(view)
    expect(view.state.doc.toString()).toBe(prefix + '> [!TIP]\n> Body\n\n')
  })

  it('continues in the middle of body text without moving unselected text', () => {
    const view = editor('> [!NOTE]\n> First second')
    act(() => view.dispatch({ selection: { anchor: view.state.doc.toString().indexOf(' second') } }))
    enter(view)
    expect(view.state.doc.toString()).toBe('> [!NOTE]\n> First\n>  second')
  })

  it('undoes a callout exit without losing the original quoted text', () => {
    const value = '> [!NOTE]\n> Body\n> '
    const view = editor(value)
    enter(view)
    expect(view.state.doc.toString()).toBe('> [!NOTE]\n> Body\n\n')
    act(() => { expect(undo(view)).toBe(true) })
    expect(view.state.doc.toString()).toBe(value)
  })

  it('exits an empty quoted line before later quoted text without removing that text', () => {
    const view = editor('> [!NOTE]\n> First\n> \n> Later')
    act(() => view.dispatch({ selection: { anchor: view.state.doc.line(3).to } }))
    enter(view)
    expect(view.state.doc.toString()).toBe('> [!NOTE]\n> First\n\n\n> Later')
    act(() => view.dispatch(view.state.replaceSelection('Outside.')))
    expect(findCalloutBlocks(view.state)[0]?.to).toBe('> [!NOTE]\n> First'.length)
    expect(view.state.doc.toString()).toContain('Outside.\n> Later')
  })

  it.each(['> ordinary quote', '> [!CUSTOM]\n> Body'])('leaves ordinary and unsupported quotes on their existing keyboard path: %s', value => {
    const view = editor(value)
    enter(view)
    enter(view)
    expect(view.state.doc.toString()).toBe(value + '\n>\n> ')
  })

  it('leaves source-mode quote exits on the standard Markdown path', () => {
    const value = '> [!NOTE]\n> Body'
    const view = editor(value, { source: true })
    enter(view)
    enter(view)
    expect(view.state.doc.toString()).toBe(value + '\n>\n> ')
    enter(view)
    expect(view.state.doc.toString()).toBe(value + '\n\n')
  })

  it.each(['> [!NOTE]\n> Body', 'Ordinary text'])('lets a host submit callback own Mod+Enter without inserting text: %s', value => {
    const onSubmit = vi.fn()
    const view = editor(value, { onSubmit })
    modEnter(view)
    expect(onSubmit).toHaveBeenCalledOnce()
    expect(view.state.doc.toString()).toBe(value)
  })

  it('keeps the default Mod+Enter blank-line behavior when no host submit callback exists', () => {
    const view = editor('Ordinary text')
    modEnter(view)
    expect(view.state.doc.toString()).toBe('Ordinary text\n')
  })

  it.each([false, true])('does not mutate read-only callouts (Shift=%s)', shift => {
    const value = '> [!NOTE]\n> Body\n> '
    const view = editor(value, { readOnly: true })
    enter(view, shift)
    expect(view.state.doc.toString()).toBe(value)
  })

  it('retains all carets rather than applying a single-caret override to a multi-selection', () => {
    const value = '> [!NOTE]\n> One\n> Two'
    const view = editor(value)
    act(() => {
      view.dispatch({ effects: StateEffect.appendConfig.of(EditorState.allowMultipleSelections.of(true)) })
      view.dispatch({ selection: EditorSelection.create([EditorSelection.cursor(view.state.doc.line(2).to), EditorSelection.cursor(view.state.doc.line(3).to)]) })
    })
    enter(view)
    expect(view.state.selection.ranges).toHaveLength(2)
    expect(view.state.doc.toString()).toBe('> [!NOTE]\n> One\n> \n> Two\n> ')
  })
})
