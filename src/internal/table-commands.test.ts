import { EditorState } from '@codemirror/state'
import { history, undo } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import { findTableBlocks } from '../extensions/tables/model'
import {
  clearTableCellRange,
  deleteTable,
  insertTableAt,
  insertTableColumn,
  insertTableRow,
  pasteTableCellRange,
  previewTableCellPaste,
  removeTableColumn,
  removeTableColumnRange,
  removeTableRow,
  removeTableRowRange,
  resizeTable,
  setTableColumnAlignment,
  updateTableCell,
  type TableBlockTarget,
  type TableCellTarget,
} from './table-commands'

const views: EditorView[] = []
afterEach(() => views.splice(0).forEach((view) => view.destroy()))

function createView(doc: string, readOnly = false): EditorView {
  const view = new EditorView({
    state: EditorState.create({
      doc,
      extensions: [
        markdown({ base: markdownLanguage }),
        history(),
        ...(readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
      ],
    }),
  })
  views.push(view)
  return view
}

function target(view: EditorView, rowIndex = 1, colIndex = 0): TableCellTarget {
  const block = findTableBlocks(view.state)[0]
  return { blockFrom: block.from, blockTo: block.to, source: block.source, rowIndex, colIndex }
}

describe('shared table commands', () => {
  it('uses a real CodeMirror transaction, retains Markdown fidelity, and undoes as one step', () => {
    const view = createView('Before\n\n| Name | Notes |\n| --- | ---: |\n| Ada | `a\\|b` |\n\nAfter')
    const before = view.state.doc.toString()

    expect(updateTableCell(view, target(view), '**Grace**')).toBe(true)
    expect(view.state.doc.toString()).toBe('Before\n\n| Name | Notes |\n| --- | ---: |\n| **Grace** | `a\\|b` |\n\nAfter')
    expect(undo(view)).toBe(true)
    expect(view.state.doc.toString()).toBe(before)
  })

  it('rejects stale targets after an interleaved external edit rather than editing a different table', () => {
    const view = createView('| A | B |\n| --- | --- |\n| 1 | 2 |\n\n| X | Y |\n| --- | --- |\n| 3 | 4 |')
    const firstTarget = target(view)

    view.dispatch({ changes: { from: 0, insert: 'External change\n' } })
    const afterExternalEdit = view.state.doc.toString()

    expect(updateTableCell(view, firstTarget, 'wrong table')).toBe(false)
    expect(view.state.doc.toString()).toBe(afterExternalEdit)
  })

  it('rejects equal-length interleaved table replacement rather than mutating the replacement', () => {
    const view = createView('| A | B |\n| --- | --- |\n| 1 | 2 |')
    const staleTarget = target(view)
    const replacement = '| X | Y |\n| --- | --- |\n| 3 | 4 |'
    expect(replacement.length).toBe(view.state.doc.length)

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: replacement } })

    expect(updateTableCell(view, staleTarget, 'wrong table')).toBe(false)
    expect(view.state.doc.toString()).toBe(replacement)
  })

  it('keeps source-mode selection in the newly inserted cell after structural changes', () => {
    const view = createView('| A | B |\n| --- | --- |\n| 1 | 2 |')

    expect(insertTableColumn(view, target(view), 'right')).toBe(true)
    let block = findTableBlocks(view.state)[0]
    expect(view.state.selection.main.from).toBe(block.cellRanges[1][1].from)

    expect(insertTableRow(view, target(view, 1, 1), 'below')).toBe(true)
    block = findTableBlocks(view.state)[0]
    expect(view.state.selection.main.from).toBe(block.cellRanges[2][0].from)
  })

  it('rejects stale range mutations after equal-length replacement', () => {
    const cases = [
      {
        doc: '|  | B |\n| --- | --- |\n|  | 2 |',
        mutate: (view: EditorView, blockTarget: TableBlockTarget) =>
          removeTableColumnRange(view, blockTarget, 0, 0),
      },
      {
        doc: '| A | B |\n| --- | --- |\n|  |  |\n| 1 | 2 |',
        mutate: (view: EditorView, blockTarget: TableBlockTarget) =>
          removeTableRowRange(view, blockTarget, 1, 1),
      },
      {
        doc: '| A | B |\n| --- | --- |\n| 1 | 2 |',
        mutate: (view: EditorView, blockTarget: TableBlockTarget) =>
          clearTableCellRange(view, blockTarget, 1, 1, 0, 0),
      },
    ]

    for (const { doc, mutate } of cases) {
      const view = createView(doc)
      const staleTarget = target(view)
      const replacement = doc.replace('B', 'X')
      expect(replacement.length).toBe(doc.length)
      view.dispatch({ changes: { from: 0, to: doc.length, insert: replacement } })

      expect(mutate(view, staleTarget)).toBe(false)
      expect(view.state.doc.toString()).toBe(replacement)
    }
  })

  it('enforces edit capability and leaves durable source unchanged on rejected operations', () => {
    const view = createView('| A | B |\n| --- | --- |\n| 1 | 2 |', true)
    const before = view.state.doc.toString()

    expect(updateTableCell(view, target(view), 'blocked')).toBe(false)
    expect(resizeTable(view, target(view), 3, 2)).toBe(false)
    expect(deleteTable(view, target(view))).toBe(false)
    expect(view.state.doc.toString()).toBe(before)
  })

  it('grows safely, sets alignment, and refuses shrink without a confirmation-capable caller', () => {
    const view = createView('| A | B |\n| --- | --- |\n| 1 | 2 |')
    const original = target(view)

    expect(resizeTable(view, original, 3, 2)).toBe(true)
    expect(view.state.doc.toString()).toBe('| A | B |  |\n| --- | --- | --- |\n| 1 | 2 |  |\n|  |  |  |')
    const grownTarget = target(view)
    expect(setTableColumnAlignment(view, { ...grownTarget, colIndex: 2 }, 'right')).toBe(true)
    expect(view.state.doc.toString()).toContain('| --- | --- | ---: |')
    const beforeRejectedShrink = view.state.doc.toString()
    expect(resizeTable(view, target(view), 2, 1)).toBe(false)
    expect(view.state.doc.toString()).toBe(beforeRejectedShrink)
  })

  it('preflights and applies a non-destructive clipboard rectangle atomically', () => {
    const view = createView('| A | B |\n| --- | --- |\n|  |  |')
    const initialTarget = target(view)

    expect(previewTableCellPaste(view, initialTarget, [['3', '4'], ['5', '6']])).toEqual({
      canApply: true,
      requiresOverwriteConfirmation: false,
      overwriteCount: 0,
      reason: null,
    })
    expect(pasteTableCellRange(view, initialTarget, [['3', '4'], ['5', '6']])).toBe(true)
    expect(view.state.doc.toString()).toBe('| A | B |\n| --- | --- |\n| 3 | 4 |\n| 5 | 6 |')
    expect(undo(view)).toBe(true)
    expect(view.state.doc.toString()).toBe('| A | B |\n| --- | --- |\n|  |  |')
  })

  it('grows a table for a clipboard rectangle but requires explicit overwrite consent', () => {
    const view = createView('| A | B |\n| --- | --- |\n| 1 | 2 |')
    const initialTarget = target(view, 1, 1)
    const cells = [['9', '3'], ['4', '5']]

    expect(previewTableCellPaste(view, initialTarget, cells)).toEqual({
      canApply: true,
      requiresOverwriteConfirmation: true,
      overwriteCount: 1,
      reason: null,
    })
    expect(pasteTableCellRange(view, initialTarget, cells)).toBe(false)
    expect(pasteTableCellRange(view, initialTarget, cells, { allowOverwrite: true })).toBe(true)
    expect(view.state.doc.toString()).toBe('| A | B |  |\n| --- | --- | --- |\n| 1 | 9 | 3 |\n|  | 4 | 5 |')
  })

  it('rejects invalid clipboard grids and table-limit overflows without mutation', () => {
    const view = createView('| A | B |\n| --- | --- |\n| 1 | 2 |')
    const initialTarget = target(view)
    const before = view.state.doc.toString()

    expect(previewTableCellPaste(view, initialTarget, [['1'], ['2', '3']])).toEqual({
      canApply: false,
      requiresOverwriteConfirmation: false,
      overwriteCount: 0,
      reason: 'invalid-grid',
    })
    expect(previewTableCellPaste(view, { ...initialTarget, colIndex: 1 }, [Array(50).fill('')])).toEqual({
      canApply: false,
      requiresOverwriteConfirmation: false,
      overwriteCount: 0,
      reason: 'out-of-bounds',
    })
    expect(view.state.doc.toString()).toBe(before)
  })

  it('refuses destructive structural removal but permits removal of an empty body row', () => {
    const populated = createView('| A | B |\n| --- | --- |\n| 1 | 2 |\n|  |  |')
    const populatedBefore = populated.state.doc.toString()
    expect(removeTableColumn(populated, target(populated))).toBe(false)
    expect(removeTableRow(populated, target(populated))).toBe(false)
    expect(populated.state.doc.toString()).toBe(populatedBefore)

    expect(removeTableRow(populated, target(populated, 2))).toBe(true)
    expect(populated.state.doc.toString()).toBe('| A | B |\n| --- | --- |\n| 1 | 2 |')
  })

  it('deletes only its resolved table and declines header reclassification', () => {
    const view = createView('Before\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\nAfter')
    const header = target(view, 0)

    expect(insertTableRow(view, header, 'above')).toBe(false)
    expect(deleteTable(view, target(view))).toBe(true)
    expect(view.state.doc.toString()).toBe('Before\n\n\n\nAfter')
  })

  it('centralises validated insertion and declines invalid dimensions without a partial document change', () => {
    const view = createView('Start')
    expect(insertTableAt(view, { from: 5, prefix: '\n\n', suffix: '\n\n', columns: 3, bodyRows: 2 })).toBe(true)
    expect(view.state.doc.toString()).toBe('Start\n\n|  |  |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |\n\n')
    const beforeInvalid = view.state.doc.toString()
    expect(insertTableAt(view, { from: 0, columns: 51, bodyRows: 1 })).toBe(false)
    expect(view.state.doc.toString()).toBe(beforeInvalid)
  })
})
