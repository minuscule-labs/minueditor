import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { setTableInteraction, tableInteractionField } from './state'

describe('table interaction state', () => {
  it('maps a table interaction through document edits and clears it explicitly', () => {
    let state = EditorState.create({ doc: '| A |\n| --- |\n| B |', extensions: [tableInteractionField] })
    state = state.update({
      effects: setTableInteraction.of({
        blockFrom: 0,
        activeCell: { rowIndex: 1, colIndex: 0 },
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
      selection: {
        anchor: { rowIndex: 1, colIndex: 0 },
        focus: { rowIndex: 1, colIndex: 0 },
      },
    })

    state = state.update({ effects: setTableInteraction.of(null) }).state
    expect(state.field(tableInteractionField)).toBeNull()
  })
})
