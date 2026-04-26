import { describe, it, expect, vi } from 'vitest'
import type { EditorView } from '@codemirror/view'
import {
  indentList,
  outdentList,
  toggleBold,
  toggleItalic,
} from './commands'

type MockSelection = {
  from: number
  to: number
  anchor: number
  head: number
  empty: boolean
}

function createMockView(lines: string[], selection?: MockSelection): EditorView {
  const lineObjs = lines.map((text, index) => {
    const from = lines.slice(0, index).reduce((sum, line) => sum + line.length + 1, 0)
    return {
      from,
      to: from + text.length,
      number: index + 1,
      text,
    }
  })

  const mainSelection = selection ?? {
    from: lineObjs[0]?.from ?? 0,
    to: lineObjs[lineObjs.length - 1]?.to ?? 0,
    anchor: lineObjs[0]?.from ?? 0,
    head: lineObjs[lineObjs.length - 1]?.to ?? 0,
    empty: lines.length === 0,
  }

  const doc = {
    lines: lineObjs.length,
    sliceString: vi.fn((from: number, to: number) => {
      const full = lines.join('\n')
      return full.slice(from, to)
    }),
    lineAt: vi.fn((pos: number) => {
      return lineObjs.find((line) => pos >= line.from && pos <= line.to) ?? lineObjs[0]
    }),
    line: vi.fn((n: number) => lineObjs[n - 1]),
  }

  const changeByRange = vi.fn((fn: (range: typeof mainSelection) => unknown) => fn(mainSelection))
  const update = vi.fn((changes: unknown) => changes)
  const dispatch = vi.fn()

  return {
    dispatch,
    state: {
      selection: { main: mainSelection },
      doc,
      changeByRange,
      update,
    },
  } as unknown as EditorView
}

describe('list indentation commands', () => {
  it('indents existing unordered list lines on Tab', () => {
    const view = createMockView(['- one', '- two'])
    const handled = indentList(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: Array<{ from: number; to: number; insert: string }>
      range: { from: number; to: number }
    }

    expect(handled).toBe(true)
    expect(view.dispatch).toHaveBeenCalledOnce()
    expect(dispatched.changes).toEqual([
      { from: 0, to: 5, insert: '    - one' },
      { from: 6, to: 11, insert: '    - two' },
    ])
    expect(dispatched.range.from).toBe(15)
    expect(dispatched.range.to).toBe(19)
  })

  it('outdents existing indented list lines on Shift-Tab', () => {
    const view = createMockView(['    - one', '    - two'])
    const handled = outdentList(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: Array<{ from: number; to: number; insert: string }>
      range: { from: number; to: number }
    }

    expect(handled).toBe(true)
    expect(view.dispatch).toHaveBeenCalledOnce()
    expect(dispatched.changes).toEqual([
      { from: 0, to: 9, insert: '- one' },
      { from: 10, to: 19, insert: '- two' },
    ])
    expect(dispatched.range.from).toBe(5)
    expect(dispatched.range.to).toBe(15)
  })

  it('does not indent non-list lines', () => {
    const view = createMockView(['plain text'])
    const handled = indentList(view)

    expect(handled).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('indents existing ordered list lines on Tab', () => {
    const view = createMockView(['1. one', '2. two'])
    const handled = indentList(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: Array<{ from: number; to: number; insert: string }>
      range: { from: number; to: number }
    }

    expect(handled).toBe(true)
    expect(dispatched.changes).toEqual([
      { from: 0, to: 6, insert: '    1. one' },
      { from: 7, to: 13, insert: '    2. two' },
    ])
    expect(dispatched.range.from).toBe(17)
    expect(dispatched.range.to).toBe(21)
  })

  it('renumbers ordered list lines after indenting a later ordered item', () => {
    const view = createMockView(['1. one', '2. two', '3. three'], {
      from: 7,
      to: 20,
      anchor: 7,
      head: 20,
      empty: false,
    })

    const handled = indentList(view)

    expect(handled).toBe(true)
    expect(view.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: [
          { from: 7, to: 13, insert: '    1. two' },
          { from: 14, to: 22, insert: '    2. three' },
        ],
      })
    )
  })

  it('uses spaces for nested list indentation so markdown continuation stays stable', () => {
    const view = createMockView(['- parent', '- child'])
    indentList(view)

    expect(view.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: [
          expect.objectContaining({ insert: '    - parent' }),
          expect.objectContaining({ insert: '    - child' }),
        ],
      })
    )
  })

  it('does not outdent top-level list lines with no indent', () => {
    const view = createMockView(['- one'])
    const handled = outdentList(view)

    expect(handled).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('renumbers ordered list lines after outdenting nested ordered items', () => {
    const view = createMockView(['1. one', '    1. two', '    2. three'], {
      from: 7,
      to: 30,
      anchor: 7,
      head: 30,
      empty: false,
    })

    const handled = outdentList(view)

    expect(handled).toBe(true)
    expect(view.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        changes: [
          { from: 7, to: 17, insert: '2. two' },
          { from: 18, to: 30, insert: '3. three' },
        ],
      })
    )
  })
})

describe('inline marker commands', () => {
  it('inserts an empty bold pair and places the cursor inside', () => {
    const view = createMockView(['hello'], {
      from: 5,
      to: 5,
      anchor: 5,
      head: 5,
      empty: true,
    })

    const handled = toggleBold(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: { from: number; insert: string }
      range: { from: number; to: number }
    }

    expect(handled).toBe(true)
    expect(dispatched.changes).toEqual({ from: 5, insert: '****' })
    expect(dispatched.range.from).toBe(7)
    expect(dispatched.range.to).toBe(7)
  })

  it('removes an empty bold pair when toggled again from inside', () => {
    const view = createMockView(['hello****'], {
      from: 7,
      to: 7,
      anchor: 7,
      head: 7,
      empty: true,
    })

    const handled = toggleBold(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: Array<{ from: number; to: number; insert: string }>
      range: { from: number; to: number }
    }

    expect(handled).toBe(true)
    expect(dispatched.changes).toEqual([
      { from: 7, to: 9, insert: '' },
      { from: 5, to: 7, insert: '' },
    ])
    expect(dispatched.range.from).toBe(5)
    expect(dispatched.range.to).toBe(5)
  })

  it('moves the cursor out of bold when toggled from inside bold text', () => {
    const view = createMockView(['hello **world**'], {
      from: 9,
      to: 9,
      anchor: 9,
      head: 9,
      empty: true,
    })

    const handled = toggleBold(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: []
      range: { from: number; to: number }
    }

    expect(handled).toBe(true)
    expect(dispatched.changes).toEqual([])
    expect(dispatched.range.from).toBe(15)
    expect(dispatched.range.to).toBe(15)
  })

  it('does nothing when bold is toggled just after a completed bold span', () => {
    const view = createMockView(['hello **world**'], {
      from: 15,
      to: 15,
      anchor: 15,
      head: 15,
      empty: true,
    })

    const handled = toggleBold(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: []
      range: { from: number; to: number }
    }

    expect(handled).toBe(true)
    expect(dispatched.changes).toEqual([])
    expect(dispatched.range.from).toBe(15)
    expect(dispatched.range.to).toBe(15)
  })

  it('inserts an empty italic pair and places the cursor inside', () => {
    const view = createMockView(['hello'], {
      from: 5,
      to: 5,
      anchor: 5,
      head: 5,
      empty: true,
    })

    const handled = toggleItalic(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: { from: number; insert: string }
      range: { from: number; to: number }
    }

    expect(handled).toBe(true)
    expect(dispatched.changes).toEqual({ from: 5, insert: '**' })
    expect(dispatched.range.from).toBe(6)
    expect(dispatched.range.to).toBe(6)
  })

  it('removes an empty italic pair when toggled again from inside', () => {
    const view = createMockView(['hello**'], {
      from: 6,
      to: 6,
      anchor: 6,
      head: 6,
      empty: true,
    })

    const handled = toggleItalic(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: Array<{ from: number; to: number; insert: string }>
      range: { from: number; to: number }
    }

    expect(handled).toBe(true)
    expect(dispatched.changes).toEqual([
      { from: 6, to: 7, insert: '' },
      { from: 5, to: 6, insert: '' },
    ])
    expect(dispatched.range.from).toBe(5)
    expect(dispatched.range.to).toBe(5)
  })

  it('moves the cursor out of italic when toggled from inside italic text', () => {
    const view = createMockView(['hello *world*'], {
      from: 8,
      to: 8,
      anchor: 8,
      head: 8,
      empty: true,
    })

    const handled = toggleItalic(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: []
      range: { from: number; to: number }
    }

    expect(handled).toBe(true)
    expect(dispatched.changes).toEqual([])
    expect(dispatched.range.from).toBe(13)
    expect(dispatched.range.to).toBe(13)
  })

  it('does nothing when italic is toggled just after a completed italic span', () => {
    const view = createMockView(['hello *world*'], {
      from: 13,
      to: 13,
      anchor: 13,
      head: 13,
      empty: true,
    })

    const handled = toggleItalic(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: []
      range: { from: number; to: number }
    }

    expect(handled).toBe(true)
    expect(dispatched.changes).toEqual([])
    expect(dispatched.range.from).toBe(13)
    expect(dispatched.range.to).toBe(13)
  })
})
