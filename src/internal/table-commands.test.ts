import { EditorState } from '@codemirror/state'
import { history, undo } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it } from 'vitest'
import { findTableBlocks } from '../extensions/tables/model'
import {
  deleteTable,
  insertTableAt,
  insertTableRow,
  removeTableColumn,
  removeTableRow,
  resizeTable,
  setTableColumnAlignment,
  updateTableCell,
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
  return { blockFrom: block.from, blockTo: block.to, rowIndex, colIndex }
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
