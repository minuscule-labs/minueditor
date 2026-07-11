import { describe, it, expect, vi } from 'vitest'
import type { EditorView } from '@codemirror/view'
import {
  deleteMarkdownListMarker,
  enterAfterHiddenInlineSuffix,
  enterInMarkdownList,
  enterInMarkdownTable,
  indentList,
  insertTableColumnLeft,
  insertTableColumnRight,
  insertTableRowAbove,
  insertTableRowBelow,
  moveCursorOutOfInlineCode,
  outdentList,
  shiftTabInMarkdownTable,
  tabInMarkdownTable,
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
  it('deletes a top-level unordered list marker at the start of content', () => {
    const view = createMockView(['- one'], {
      from: 2,
      to: 2,
      anchor: 2,
      head: 2,
      empty: true,
    })

    const handled = deleteMarkdownListMarker(view)

    expect(handled).toBe(true)
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: 2, insert: '' },
      selection: expect.anything(),
    })
  })

  it('deletes a top-level task list marker at the start of content', () => {
    const view = createMockView(['- [ ] one'], {
      from: 6,
      to: 6,
      anchor: 6,
      head: 6,
      empty: true,
    })

    const handled = deleteMarkdownListMarker(view)

    expect(handled).toBe(true)
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: 6, insert: '' },
      selection: expect.anything(),
    })
  })

  it('continues unordered lists on Enter without an extra blank line', () => {
    const view = createMockView(['- one'], {
      from: 5,
      to: 5,
      anchor: 5,
      head: 5,
      empty: true,
    })

    const handled = enterInMarkdownList(view)

    expect(handled).toBe(true)
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 5, insert: '\n- ' },
      selection: expect.anything(),
      scrollIntoView: true,
    })
  })

  it('lets normal Backspace run away from the list marker boundary', () => {
    const view = createMockView(['- one'], {
      from: 4,
      to: 4,
      anchor: 4,
      head: 4,
      empty: true,
    })

    expect(deleteMarkdownListMarker(view)).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('continues task lists on Enter without an extra blank line', () => {
    const view = createMockView(['- [ ] one'], {
      from: 9,
      to: 9,
      anchor: 9,
      head: 9,
      empty: true,
    })

    const handled = enterInMarkdownList(view)

    expect(handled).toBe(true)
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 9, insert: '\n- [ ] ' },
      selection: expect.anything(),
      scrollIntoView: true,
    })
  })

  it('continues ordered lists with the next number on Enter', () => {
    const view = createMockView(['1. one'], {
      from: 6,
      to: 6,
      anchor: 6,
      head: 6,
      empty: true,
    })

    const handled = enterInMarkdownList(view)

    expect(handled).toBe(true)
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 6, insert: '\n2. ' },
      selection: expect.anything(),
      scrollIntoView: true,
    })
  })

  it('exits unordered lists from an empty item on Enter', () => {
    const view = createMockView(['- '], {
      from: 2,
      to: 2,
      anchor: 2,
      head: 2,
      empty: true,
    })

    const handled = enterInMarkdownList(view)

    expect(handled).toBe(true)
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: 2, insert: '' },
      selection: expect.anything(),
      scrollIntoView: true,
    })
  })

  it('exits nested unordered lists to the true line beginning on Enter', () => {
    const view = createMockView(['- one', '    - '], {
      from: 12,
      to: 12,
      anchor: 12,
      head: 12,
      empty: true,
    })

    const handled = enterInMarkdownList(view)

    expect(handled).toBe(true)
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 6, to: 12, insert: '' },
      selection: expect.anything(),
      scrollIntoView: true,
    })
  })

  it('exits nested task lists to the true line beginning on Enter', () => {
    const view = createMockView(['- [ ] one', '    - [ ] '], {
      from: 20,
      to: 20,
      anchor: 20,
      head: 20,
      empty: true,
    })

    const handled = enterInMarkdownList(view)

    expect(handled).toBe(true)
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 10, to: 20, insert: '' },
      selection: expect.anything(),
      scrollIntoView: true,
    })
  })

  it('exits nested ordered lists to the true line beginning on Enter', () => {
    const view = createMockView(['1. one', '    1. '], {
      from: 14,
      to: 14,
      anchor: 14,
      head: 14,
      empty: true,
    })

    const handled = enterInMarkdownList(view)

    expect(handled).toBe(true)
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 7, to: 14, insert: '' },
      selection: expect.anything(),
      scrollIntoView: true,
    })
  })

  it('exits nested unordered lists without a trailing marker space to the true line beginning', () => {
    const view = createMockView(['- one', '    -'], {
      from: 11,
      to: 11,
      anchor: 11,
      head: 11,
      empty: true,
    })

    const handled = enterInMarkdownList(view)

    expect(handled).toBe(true)
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 6, to: 11, insert: '' },
      selection: expect.anything(),
      scrollIntoView: true,
    })
  })

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

  it('moves right out of inline code from the visual content end', () => {
    const view = createMockView(['`code`'], {
      from: 5,
      to: 5,
      anchor: 5,
      head: 5,
      empty: true,
    })

    const handled = moveCursorOutOfInlineCode(view, 'right')

    expect(handled).toBe(true)
    expect(view.dispatch).toHaveBeenCalledWith({ selection: expect.anything() })
  })

  it('moves left out of inline code from the visual content start', () => {
    const view = createMockView(['`code`'], {
      from: 1,
      to: 1,
      anchor: 1,
      head: 1,
      empty: true,
    })

    expect(moveCursorOutOfInlineCode(view, 'left')).toBe(true)
    expect(view.dispatch).toHaveBeenCalledWith({ selection: expect.anything() })
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

  it('inserts newline at true line end inside hidden inline code suffix', () => {
    const view = createMockView(['- **Bold**, `inline code`'], {
      from: 24,
      to: 24,
      anchor: 24,
      head: 24,
      empty: true,
    })

    const handled = enterAfterHiddenInlineSuffix(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: { from: number; insert: string }
    }

    expect(handled).toBe(true)
    expect(dispatched.changes).toEqual({ from: 25, insert: '\n- ' })
  })

  it('does not change cursor when already at true inline end', () => {
    const view = createMockView(['- **Bold**, `inline code`'], {
      from: 25,
      to: 25,
      anchor: 25,
      head: 25,
      empty: true,
    })

    const handled = enterAfterHiddenInlineSuffix(view)

    expect(handled).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('inserts newline after closing backtick for simple inline code line end', () => {
    const view = createMockView(['`text`'], {
      from: 5,
      to: 5,
      anchor: 5,
      head: 5,
      empty: true,
    })

    const handled = enterAfterHiddenInlineSuffix(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: { from: number; insert: string }
    }

    expect(handled).toBe(true)
    expect(dispatched.changes).toEqual({ from: 6, insert: '\n' })
  })

  it('inserts a new table row at end of table data line', () => {
    const view = createMockView(['| Name | Age |', '| --- | --- |', '| Ada | 42 |'], {
      from: 41,
      to: 41,
      anchor: 41,
      head: 41,
      empty: true,
    })

    const handled = enterInMarkdownTable(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: { from: number; insert: string }
      selection: { anchor: number; head: number }
    }

    expect(handled).toBe(true)
    expect(dispatched.changes).toEqual({ from: 41, insert: '\n|||' })
    expect(dispatched.selection.anchor).toBe(43)
    expect(dispatched.selection.head).toBe(43)
  })

  it('does not handle Enter on a table header line', () => {
    const view = createMockView(['| Name | Age |', '| --- | --- |', '| Ada | 42 |'], {
      from: 14,
      to: 14,
      anchor: 14,
      head: 14,
      empty: true,
    })

    const handled = enterInMarkdownTable(view)

    expect(handled).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('moves to the next table cell on Tab', () => {
    const view = createMockView(['| Name | Age |', '| --- | --- |', '| Ada | 42 |'], {
      from: 32,
      to: 32,
      anchor: 32,
      head: 32,
      empty: true,
    })

    const handled = tabInMarkdownTable(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      selection: { anchor: number; head: number }
    }

    expect(handled).toBe(true)
    expect(dispatched.selection.anchor).toBe(37)
    expect(dispatched.selection.head).toBe(37)
  })

  it('moves to first cell of next row when tabbing out of last cell', () => {
    const view = createMockView(
      ['| Name | Age |', '| --- | --- |', '| Ada | 42 |', '| Bob | 30 |'],
      {
        from: 50,
        to: 50,
        anchor: 50,
        head: 50,
        empty: true,
      }
    )

    const handled = tabInMarkdownTable(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      selection: { anchor: number; head: number }
    }

    expect(handled).toBe(true)
    expect(dispatched.selection.anchor).toBe(56)
    expect(dispatched.selection.head).toBe(56)
  })

  it('inserts a new row when tabbing out of last cell on last row', () => {
    const view = createMockView(['| Name | Age |', '| --- | --- |', '| Ada | 42 |'], {
      from: 37,
      to: 37,
      anchor: 37,
      head: 37,
      empty: true,
    })

    const handled = tabInMarkdownTable(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: { from: number; insert: string }
      selection: { anchor: number; head: number }
    }

    expect(handled).toBe(true)
    expect(dispatched.changes).toEqual({ from: 41, insert: '\n|||' })
    expect(dispatched.selection.anchor).toBe(43)
    expect(dispatched.selection.head).toBe(43)
  })

  it('moves to previous row last cell on Shift-Tab from first cell', () => {
    const view = createMockView(
      ['| Name | Age |', '| --- | --- |', '| Ada | 42 |', '| Bob | 30 |'],
      {
        from: 44,
        to: 44,
        anchor: 44,
        head: 44,
        empty: true,
      }
    )

    const handled = shiftTabInMarkdownTable(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      selection: { anchor: number; head: number }
    }

    expect(handled).toBe(true)
    expect(dispatched.selection.anchor).toBe(37)
    expect(dispatched.selection.head).toBe(37)
  })

  it('inserts a column to the right of current cell', () => {
    const view = createMockView(['| Name | Age |', '| --- | --- |', '| Ada | 42 |'], {
      from: 31,
      to: 31,
      anchor: 31,
      head: 31,
      empty: true,
    })

    const handled = insertTableColumnRight(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: Array<{ from: number; to: number; insert: string }>
      selection: { anchor: number; head: number }
    }

    expect(handled).toBe(true)
    expect(dispatched.changes).toEqual([
      { from: 0, to: 14, insert: '| Name || Age |' },
      { from: 15, to: 28, insert: '| --- | --- | --- |' },
      { from: 29, to: 41, insert: '| Ada || 42 |' },
    ])
    expect(dispatched.selection.anchor).toBe(43)
    expect(dispatched.selection.head).toBe(43)
  })

  it('inserts a column to the left of current cell', () => {
    const view = createMockView(['| Name | Age |', '| --- | --- |', '| Ada | 42 |'], {
      from: 37,
      to: 37,
      anchor: 37,
      head: 37,
      empty: true,
    })

    const handled = insertTableColumnLeft(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: Array<{ from: number; to: number; insert: string }>
      selection: { anchor: number; head: number }
    }

    expect(handled).toBe(true)
    expect(dispatched.changes).toEqual([
      { from: 0, to: 14, insert: '| Name || Age |' },
      { from: 15, to: 28, insert: '| --- | --- | --- |' },
      { from: 29, to: 41, insert: '| Ada || 42 |' },
    ])
    expect(dispatched.selection.anchor).toBe(43)
    expect(dispatched.selection.head).toBe(43)
  })

  it('inserts a row below current body row', () => {
    const view = createMockView(['| Name | Age |', '| --- | --- |', '| Ada | 42 |'], {
      from: 31,
      to: 31,
      anchor: 31,
      head: 31,
      empty: true,
    })

    const handled = insertTableRowBelow(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: { from: number; insert: string }
      selection: { anchor: number; head: number }
    }

    expect(handled).toBe(true)
    expect(dispatched.changes).toEqual({ from: 41, insert: '\n|||' })
    expect(dispatched.selection.anchor).toBe(43)
    expect(dispatched.selection.head).toBe(43)
  })

  it('inserts a row above current body row', () => {
    const view = createMockView(
      ['| Name | Age |', '| --- | --- |', '| Ada | 42 |', '| Bob | 30 |'],
      {
        from: 44,
        to: 44,
        anchor: 44,
        head: 44,
        empty: true,
      }
    )

    const handled = insertTableRowAbove(view)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: { from: number; insert: string }
      selection: { anchor: number; head: number }
    }

    expect(handled).toBe(true)
    expect(dispatched.changes).toEqual({ from: 42, insert: '|||\n' })
    expect(dispatched.selection.anchor).toBe(43)
    expect(dispatched.selection.head).toBe(43)
  })
})
