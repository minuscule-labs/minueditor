import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { describe, expect, it } from 'vitest'
import {
  activeTableField,
  externalChangeInvalidatesTableInteraction,
  setActiveTable,
  setTableInteraction,
  tableInteractionField,
} from './state'

const table = '| A |\n| --- |\n| B |'

function activeTableState(doc = table, blockFrom = 0): EditorState {
  const state = EditorState.create({
    doc,
    extensions: [
      markdown({ base: markdownLanguage }),
      activeTableField,
      tableInteractionField,
    ],
  })
  return state.update({
    effects: [
      setActiveTable.of(blockFrom),
      setTableInteraction.of({
        blockFrom,
        activeCell: { rowIndex: 1, colIndex: 0 },
        selectionAnchor: { rowIndex: 1, colIndex: 0 },
        selection: null,
      }),
    ],
  }).state
}

describe('table interaction state', () => {
  it('maps a table interaction through document edits and clears it explicitly', () => {
    let state = EditorState.create({ doc: '| A |\n| --- |\n| B |', extensions: [tableInteractionField] })
    state = state.update({
      effects: setTableInteraction.of({
        blockFrom: 0,
        activeCell: { rowIndex: 1, colIndex: 0 },
        selectionAnchor: { rowIndex: 1, colIndex: 0 },
        selection: {
          anchor: { rowIndex: 1, colIndex: 0 },
          focus: { rowIndex: 1, colIndex: 0 },
        },
      }),
    }).state

    state = state.update({ changes: { from: 0, insert: 'Before\n\n' } }).state
    expect(state.field(tableInteractionField)).toEqual({
      blockFrom: 8,
      activeCell: { rowIndex: 1, colIndex: 0 },
      selectionAnchor: { rowIndex: 1, colIndex: 0 },
      selection: {
        anchor: { rowIndex: 1, colIndex: 0 },
        focus: { rowIndex: 1, colIndex: 0 },
      },
    })

    state = state.update({ effects: setTableInteraction.of(null) }).state
    expect(state.field(tableInteractionField)).toBeNull()
  })

  it('preserves interaction only for controlled changes strictly outside the active table', () => {
    const state = activeTableState(`before\n\n${table}\n\nafter`, 8)

    expect(externalChangeInvalidatesTableInteraction(state, { from: 0, to: 6, insert: 'updated' })).toBe(false)
    expect(externalChangeInvalidatesTableInteraction(state, { from: 7, to: 7, insert: 'more' })).toBe(false)
    expect(externalChangeInvalidatesTableInteraction(state, { from: 29, to: 29, insert: 'more' })).toBe(false)
    expect(externalChangeInvalidatesTableInteraction(state, { from: 31, to: 36, insert: 'updated' })).toBe(false)
  })

  it('invalidates table edits while allowing newline-separated boundary insertions', () => {
    const state = activeTableState()

    expect(externalChangeInvalidatesTableInteraction(state, { from: 0, to: 0, insert: 'prefix' })).toBe(true)
    expect(externalChangeInvalidatesTableInteraction(state, { from: 0, to: 0, insert: 'prefix\n' })).toBe(false)
    expect(externalChangeInvalidatesTableInteraction(state, { from: 2, to: 2, insert: 'x' })).toBe(true)
    expect(externalChangeInvalidatesTableInteraction(state, { from: 2, to: 3, insert: 'x' })).toBe(true)
    expect(externalChangeInvalidatesTableInteraction(state, { from: table.length, to: table.length, insert: 'suffix' })).toBe(true)
    expect(externalChangeInvalidatesTableInteraction(state, { from: table.length, to: table.length, insert: '\nsuffix' })).toBe(false)
    expect(externalChangeInvalidatesTableInteraction(state, { from: 0, to: table.length, insert: table })).toBe(true)
  })

  it('invalidates inconsistent or stale tracked table state', () => {
    const state = activeTableState('not a table')
    expect(externalChangeInvalidatesTableInteraction(state, { from: 0, to: 0, insert: 'x' })).toBe(true)

    const activeOnly = EditorState.create({
      doc: table,
      extensions: [markdown({ base: markdownLanguage }), activeTableField, tableInteractionField],
    }).update({ effects: setActiveTable.of(0) }).state
    expect(externalChangeInvalidatesTableInteraction(activeOnly, {
      from: table.length,
      to: table.length,
      insert: '\n',
    })).toBe(true)
  })
})
