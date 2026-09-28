import { describe, it, expect, vi } from 'vitest'
import { EditorSelection, EditorState, StateEffect } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import type { EditorView } from '@codemirror/view'
import {
  deleteMarkdownListMarker,
  enterAfterHiddenInlineSuffix,
  enterInMarkdownList,
  enterInMarkdownTable,
  canIndentList,
  canOutdentList,
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
  toggleCheckboxList,
  toggleOrderedList,
  toggleUnorderedList,
  wrapLink,
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

function createStatefulView(doc: string, selection: { anchor: number; head?: number }): EditorView {
  let state = EditorState.create({ doc, selection, extensions: [markdown({ base: markdownLanguage })] })
  return {
    get state() {
      return state
    },
    dom: document.createElement('div'),
    scrollSnapshot: () => StateEffect.define<null>().of(null),
    dispatch(spec: Parameters<EditorState['update']>[0]) {
      state = state.update(spec).state
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

  it('outdents nested unordered lists one level on Enter', () => {
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
      changes: { from: 6, to: 12, insert: '- ' },
      selection: expect.anything(),
      scrollIntoView: true,
    })
  })

  it('outdents nested task lists one level on Enter', () => {
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
      changes: { from: 10, to: 20, insert: '- [ ] ' },
      selection: expect.anything(),
      scrollIntoView: true,
    })
  })

  it('outdents nested ordered lists with the parent sequence on Enter', () => {
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
      changes: { from: 7, to: 14, insert: '2. ' },
      selection: expect.anything(),
      scrollIntoView: true,
    })
  })

  it('outdents nested unordered lists without a trailing marker space', () => {
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
      changes: { from: 6, to: 11, insert: '- ' },
      selection: expect.anything(),
      scrollIntoView: true,
    })
  })

  it('indents existing unordered siblings under the preceding parent', () => {
    const view = createStatefulView('- parent\n- one\n- two', { anchor: 9, head: 20 })
    expect(indentList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('- parent\n    - one\n    - two')
  })

  it('outdents existing indented list lines on Shift-Tab', () => {
    const view = createMockView(['    - one', '    - two'])
    const handled = outdentList(view, true)
    const dispatched = vi.mocked(view.dispatch).mock.calls[0][0] as {
      changes: Array<{ from: number; to: number; insert: string }>
      range: { from: number; to: number }
    }

    expect(handled).toBe(true)
    expect(view.dispatch).toHaveBeenCalledOnce()
    expect(dispatched.changes).toEqual([
      { from: 0, to: 4, insert: '' },
      { from: 10, to: 14, insert: '' },
    ])
  })

  it('does not outdent list-like fenced code unless raw indentation is requested', () => {
    const source = '```\n    - code\n```'
    const view = createStatefulView(source, { anchor: source.indexOf('- code') + 1 })

    expect(canOutdentList(view)).toBe(false)
    expect(outdentList(view)).toBe(false)
    expect(view.state.doc.toString()).toBe(source)

    expect(canOutdentList(view, true)).toBe(true)
    expect(outdentList(view, true)).toBe(true)
    expect(view.state.doc.toString()).toBe('```\n- code\n```')
  })

  it('reports list indentation availability from parsed context', () => {
    const root = createStatefulView('- root', { anchor: 2 })
    expect(canIndentList(root)).toBe(false)
    expect(canOutdentList(root)).toBe(false)

    const sibling = createStatefulView('- root\n- child', { anchor: 9 })
    expect(canIndentList(sibling)).toBe(true)
    expect(canOutdentList(sibling)).toBe(false)
    expect(indentList(sibling)).toBe(true)
    expect(canIndentList(sibling)).toBe(false)
    expect(canOutdentList(sibling)).toBe(true)
  })

  it('keeps a caret attached to the same list text after indenting', () => {
    const view = createStatefulView('- parent\n- abcdef', { anchor: 13 })

    expect(indentList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('- parent\n    - abcdef')
    expect(view.state.selection.main.anchor).toBe(17)
  })

  it('preserves backward selection direction while indenting', () => {
    const view = createStatefulView('- parent\n- abcdef', { anchor: 15, head: 11 })

    expect(indentList(view)).toBe(true)
    expect(view.state.selection.main.anchor).toBe(19)
    expect(view.state.selection.main.head).toBe(15)
  })

  it('maps a cross-line selection through all list-toggle changes', () => {
    const view = createStatefulView('one\ntwo', { anchor: 3, head: 4 })

    expect(toggleUnorderedList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('- one\n- two')
    expect(view.state.selection.main.anchor).toBe(5)
    expect(view.state.selection.main.head).toBe(8)
  })

  it('maps the selection after adding and removing a list marker', () => {
    const view = createStatefulView('hello', { anchor: 3 })

    expect(toggleUnorderedList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('- hello')
    expect(view.state.selection.main.anchor).toBe(5)
    expect(toggleUnorderedList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('hello')
    expect(view.state.selection.main.anchor).toBe(3)
  })

  it('converts bullets, ordered items, and partial tasks without stacking markers', () => {
    const bullet = createStatefulView('- one', { anchor: 4 })
    expect(toggleCheckboxList(bullet)).toBe(true)
    expect(bullet.state.doc.toString()).toBe('- [ ] one')
    expect(bullet.state.selection.main.anchor).toBe(8)
    expect(toggleUnorderedList(bullet)).toBe(true)
    expect(bullet.state.doc.toString()).toBe('- one')
    expect(bullet.state.selection.main.anchor).toBe(4)

    const ordered = createStatefulView('2. two', { anchor: 5 })
    expect(toggleCheckboxList(ordered)).toBe(true)
    expect(ordered.state.doc.toString()).toBe('- [ ] two')
    expect(toggleOrderedList(ordered)).toBe(true)
    expect(ordered.state.doc.toString()).toBe('1. two')

    const partial = createStatefulView('    - [/] three', { anchor: 13 })
    expect(toggleCheckboxList(partial)).toBe(true)
    expect(partial.state.doc.toString()).toBe('    three')
    expect(toggleUnorderedList(partial)).toBe(true)
    expect(partial.state.doc.toString()).toBe('    - three')
  })

  it('converts a task with extra marker whitespace to an unordered bullet', () => {
    const task = createStatefulView('-  [ ] one', { anchor: 8 })
    expect(toggleUnorderedList(task)).toBe(true)
    expect(task.state.doc.toString()).toBe('- one')
  })

  it('applies a list toggle uniformly to mixed selected lines', () => {
    const task = createStatefulView('- one\n- [x] two', { anchor: 3, head: 14 })
    expect(toggleCheckboxList(task)).toBe(true)
    expect(task.state.doc.toString()).toBe('- [ ] one\n- [x] two')
    expect(task.state.selection.main.anchor).toBe(7)
    expect(task.state.selection.main.head).toBe(18)
    expect(toggleCheckboxList(task)).toBe(true)
    expect(task.state.doc.toString()).toBe('one\ntwo')

    const bullet = createStatefulView('- one\n- [ ] two', { anchor: 3, head: 14 })
    expect(toggleUnorderedList(bullet)).toBe(true)
    expect(bullet.state.doc.toString()).toBe('- one\n- two')
    expect(toggleUnorderedList(bullet)).toBe(true)
    expect(bullet.state.doc.toString()).toBe('one\ntwo')
  })

  it('renumbers all selected lines when converting a mixed list to ordered', () => {
    const view = createStatefulView('5. one\n- two\n7. three', { anchor: 4, head: 20 })
    expect(toggleOrderedList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('1. one\n2. two\n3. three')
    expect(toggleOrderedList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('one\ntwo\nthree')
  })

  it('numbers mixed ordered items independently at each nesting depth', () => {
    const doc = '1. parent\n    - child\n2. sibling'
    const view = createStatefulView(doc, { anchor: 0, head: doc.length })
    expect(toggleOrderedList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('1. parent\n    1. child\n2. sibling')
  })

  it('does not indent a list without an available preceding sibling', () => {
    const lone = createStatefulView('- [ ] one', { anchor: 9 })
    expect(indentList(lone)).toBe(false)
    expect(lone.state.doc.toString()).toBe('- [ ] one')

    const all = createStatefulView('- one\n- two', { anchor: 2, head: 10 })
    expect(indentList(all)).toBe(false)
    expect(all.state.doc.toString()).toBe('- one\n- two')

    const firstNested = createStatefulView('- parent\n    - [ ] child', { anchor: 20 })
    expect(indentList(firstNested)).toBe(false)
    expect(firstNested.state.doc.toString()).toBe('- parent\n    - [ ] child')
  })

  it('indents a sibling beneath an unselected parent, including ordered parents', () => {
    const view = createStatefulView('- parent\n- one\n- two', { anchor: 9, head: 20 })
    expect(indentList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('- parent\n    - one\n    - two')

    const orderedParent = createStatefulView('1. parent\n- [ ] child', { anchor: 19 })
    expect(indentList(orderedParent)).toBe(true)
    expect(orderedParent.state.doc.toString()).toBe('1. parent\n    - [ ] child')
  })

  it('maps multiple cursors while converting bullet and ordered items to tasks', () => {
    let state = EditorState.create({
      doc: '- one\n1. two',
      selection: EditorSelection.create([
        EditorSelection.cursor(4),
        EditorSelection.cursor(10),
      ]),
      extensions: [EditorState.allowMultipleSelections.of(true)],
    })
    const view = {
      get state() { return state },
      dispatch(spec: Parameters<EditorState['update']>[0]) { state = state.update(spec).state },
    } as unknown as EditorView

    expect(toggleCheckboxList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('- [ ] one\n- [ ] two')
    expect(view.state.selection.ranges.map((range) => range.anchor)).toEqual([8, 17])
  })

  it('maps every cursor through all multi-cursor list changes', () => {
    let state = EditorState.create({
      doc: '- parent\n- abc\n- def',
      selection: EditorSelection.create([
        EditorSelection.cursor(13),
        EditorSelection.cursor(19),
      ]),
      extensions: [EditorState.allowMultipleSelections.of(true), markdown({ base: markdownLanguage })],
    })
    const view = {
      get state() {
        return state
      },
      dispatch(spec: Parameters<EditorState['update']>[0]) {
        state = state.update(spec).state
      },
    } as unknown as EditorView

    expect(indentList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('- parent\n    - abc\n    - def')
    expect(view.state.selection.ranges.map((range) => range.anchor)).toEqual([17, 27])
  })

  it('changes a shared list line only once for multiple cursors', () => {
    let state = EditorState.create({
      doc: '- parent\n- abc',
      selection: EditorSelection.create([
        EditorSelection.cursor(12),
        EditorSelection.cursor(13),
      ]),
      extensions: [EditorState.allowMultipleSelections.of(true), markdown({ base: markdownLanguage })],
    })
    const view = {
      get state() {
        return state
      },
      dispatch(spec: Parameters<EditorState['update']>[0]) {
        state = state.update(spec).state
      },
    } as unknown as EditorView

    expect(indentList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('- parent\n    - abc')
    expect(view.state.selection.ranges.map((range) => range.anchor)).toEqual([16, 17])
  })

  it('does not indent non-list lines', () => {
    const view = createMockView(['plain text'])
    const handled = indentList(view)

    expect(handled).toBe(false)
    expect(view.dispatch).not.toHaveBeenCalled()
  })

  it('indents an ordered sibling on Tab', () => {
    const view = createStatefulView('1. one\n2. two', { anchor: 9 })
    expect(indentList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('1. one\n    1. two')
  })

  it('indents beneath a wide ordered marker and Shift-Tab restores the original line', () => {
    const original = '123. parent\n- [ ] child'
    const view = createStatefulView(original, { anchor: original.length })
    expect(indentList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('123. parent\n     - [ ] child')
    expect(outdentList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe(original)
  })

  it('indents and outdents a selected block under one wide ordered parent uniformly', () => {
    const original = '123. parent\n- [ ] first\n- [ ] second'
    const from = original.indexOf('- [ ] first')
    const view = createStatefulView(original, { anchor: from, head: original.length })
    expect(indentList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('123. parent\n     - [ ] first\n     - [ ] second')
    expect(outdentList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe(original)
  })

  it('renumbers ordered list lines after indenting later ordered siblings', () => {
    const view = createStatefulView('1. one\n2. two\n3. three', { anchor: 7, head: 20 })
    expect(indentList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('1. one\n    1. two\n    2. three')
  })

  it('renumbers following ordered siblings while preserving a multi-digit list start', () => {
    const view = createStatefulView('9. nine\n10. ten\n11. eleven', { anchor: 12 })

    expect(indentList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('9. nine\n    1. ten\n10. eleven')
    expect(view.state.selection.main.anchor).toBe(15)
  })

  it('uses spaces for nested list indentation so markdown continuation stays stable', () => {
    const view = createStatefulView('- parent\n- child', { anchor: 13 })
    expect(indentList(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('- parent\n    - child')
  })

  it('does not outdent top-level list lines with no indent', () => {
    const view = createStatefulView('- one', { anchor: 2 })
    const handled = outdentList(view)

    expect(handled).toBe(false)
    expect(view.state.doc.toString()).toBe('- one')
  })

  it('renumbers ordered list lines after outdenting nested ordered items', () => {
    const view = createStatefulView('1. one\n    1. two\n    2. three', { anchor: 7, head: 30 })
    const handled = outdentList(view)

    expect(handled).toBe(true)
    expect(view.state.doc.toString()).toBe('1. one\n2. two\n3. three')
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

  it('wraps selected text as a markdown link and leaves the cursor at the visible label end', () => {
    const view = createMockView(['hello'], {
      from: 0,
      to: 5,
      anchor: 0,
      head: 5,
      empty: false,
    })

    const handled = wrapLink(view)

    expect(handled).toBe(true)
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 0, to: 5, insert: '[hello]()' },
      selection: { anchor: 6 },
    })
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

  it('routes source-mode column insertion through the shared command model', () => {
    const view = createStatefulView('| Name | Age |\n| --- | --- |\n| Ada | 42 |', { anchor: 31 })

    expect(insertTableColumnRight(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('| Name |  | Age |\n| --- | --- | --- |\n| Ada |  | 42 |')
    expect(view.state.selection.main.from).toBe(47)
  })

  it('inserts a source-mode column to the left through the shared model', () => {
    const view = createStatefulView('| Name | Age |\n| --- | --- |\n| Ada | 42 |', { anchor: 37 })

    expect(insertTableColumnLeft(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('| Name |  | Age |\n| --- | --- | --- |\n| Ada |  | 42 |')
    expect(view.state.selection.main.from).toBe(47)
  })

  it('routes source-mode row insertion through the shared command model', () => {
    const view = createStatefulView('| Name | Age |\n| --- | --- |\n| Ada | 42 |', { anchor: 31 })

    expect(insertTableRowBelow(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('| Name | Age |\n| --- | --- |\n| Ada | 42 |\n|  |  |')
    expect(view.state.selection.main.from).toBe(45)
  })

  it('inserts a source-mode row above through the shared model', () => {
    const view = createStatefulView('| Name | Age |\n| --- | --- |\n| Ada | 42 |\n| Bob | 30 |', { anchor: 44 })

    expect(insertTableRowAbove(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('| Name | Age |\n| --- | --- |\n| Ada | 42 |\n|  |  |\n| Bob | 30 |')
    expect(view.state.selection.main.from).toBe(45)
  })
})
