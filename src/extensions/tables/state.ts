import { StateEffect, StateField } from '@codemirror/state'

export type TableCellCoordinates = {
  rowIndex: number
  colIndex: number
}

export type TableCellSelection = {
  anchor: TableCellCoordinates
  focus: TableCellCoordinates
}

/** Durable interaction state; the widget DOM mirrors this state, not vice versa. */
export type TableInteraction = {
  blockFrom: number
  activeCell: TableCellCoordinates
  selection: TableCellSelection | null
}

export const setActiveTable = StateEffect.define<number | null>()
export const setTableInteraction = StateEffect.define<TableInteraction | null>()

export const activeTableField = StateField.define<number | null>({
  create() {
    return null
  },
  update(value, tr) {
    let nextValue = value
    if (nextValue != null) nextValue = tr.changes.mapPos(nextValue, 1)
    for (const effect of tr.effects) {
      if (effect.is(setActiveTable)) nextValue = effect.value
    }
    return nextValue
  },
})

export const tableInteractionField = StateField.define<TableInteraction | null>({
  create() {
    return null
  },
  update(value, tr) {
    let nextValue = value && {
      ...value,
      blockFrom: tr.changes.mapPos(value.blockFrom, 1),
    }
    for (const effect of tr.effects) {
      if (effect.is(setTableInteraction)) nextValue = effect.value
    }
    return nextValue
  },
})
