import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { EditorToolbar } from './Toolbar'
import type { EditorView } from '@codemirror/view'

function mockView(): EditorView {
  return {
    dispatch: vi.fn(),
    focus: vi.fn(),
    state: {
      selection: {
        main: { from: 0, to: 0, empty: true, anchor: 0, head: 0 },
      },
      doc: {
        toString: () => '',
        sliceString: vi.fn().mockReturnValue(''),
        lineAt: vi.fn().mockReturnValue({ from: 0, to: 0, number: 1, text: '' }),
        line: vi.fn().mockReturnValue({ from: 0, to: 0, number: 1, text: '' }),
      },
      field: vi.fn(),
      sliceDoc: vi.fn().mockReturnValue(''),
      // changeByRange returns a partial TransactionSpec (not calling the callback)
      changeByRange: vi.fn().mockReturnValue({ changes: [], selection: null }),
      // update wraps the spec into a transaction object
      update: vi.fn().mockReturnValue({}),
    },
  } as unknown as EditorView
}

describe('EditorToolbar', () => {
  it('renders nothing when view is null', () => {
    const { container } = render(<EditorToolbar view={null} variant={'full'} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders nothing when variant is floating', () => {
    const view = mockView()
    const { container } = render(<EditorToolbar view={view} variant={'floating'} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the toolbar with role=toolbar when view is set', () => {
    const view = mockView()
    render(<EditorToolbar view={view} variant={'full'} />)
    expect(screen.getByRole('toolbar')).toBeInTheDocument()
  })

  it('renders a button for Bold', () => {
    const view = mockView()
    render(<EditorToolbar view={view} variant={'full'} />)
    expect(screen.getByTitle('Bold (Cmd+B)')).toBeInTheDocument()
  })

  it('renders a button for Italic', () => {
    const view = mockView()
    render(<EditorToolbar view={view} variant={'full'} />)
    expect(screen.getByTitle('Italic (Cmd+I)')).toBeInTheDocument()
  })

  it('renders heading buttons', () => {
    const view = mockView()
    render(<EditorToolbar view={view} variant={'full'} />)
    expect(screen.getByTitle('Heading 1')).toBeInTheDocument()
    expect(screen.getByTitle('Heading 2')).toBeInTheDocument()
    expect(screen.getByTitle('Heading 3')).toBeInTheDocument()
  })

  it('calls view.focus() after mousedown on a button', () => {
    const view = mockView()
    render(<EditorToolbar view={view} variant={'full'} />)
    const boldBtn = screen.getByTitle('Bold (Cmd+B)')
    fireEvent.mouseDown(boldBtn)
    expect(view.focus).toHaveBeenCalled()
  })

  it('calls view.dispatch() after mousedown on a button', () => {
    const view = mockView()
    render(<EditorToolbar view={view} variant={'full'} />)
    const boldBtn = screen.getByTitle('Bold (Cmd+B)')
    fireEvent.mouseDown(boldBtn)
    // dispatch is called by the command internals
    expect(view.dispatch).toHaveBeenCalled()
  })

  it('renders separator elements between groups', () => {
    const view = mockView()
    const { container } = render(<EditorToolbar view={view} variant={'full'} />)
    const seps = container.querySelectorAll('.me-toolbar-sep')
    expect(seps.length).toBeGreaterThan(0)
  })

  it('renders table row and column insertion buttons', () => {
    const view = mockView()
    render(<EditorToolbar view={view} variant={'full'} />)

    expect(screen.getByTitle('Insert column left (Cmd+←)')).toBeInTheDocument()
    expect(screen.getByTitle('Insert column right (Cmd+→)')).toBeInTheDocument()
    expect(screen.getByTitle('Insert row above (Cmd+↑)')).toBeInTheDocument()
    expect(screen.getByTitle('Insert row below (Cmd+↓)')).toBeInTheDocument()
  })
})
