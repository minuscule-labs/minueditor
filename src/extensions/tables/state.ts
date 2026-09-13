import { Facet, StateEffect, StateField, type EditorState } from '@codemirror/state'
import { getTableBlockByStart, type TableBlock } from './model'

export const tableSubmitHandler = Facet.define<() => void, (() => void) | null>({
  combine: (handlers) => handlers[0] ?? null,
})

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
  /** Shift-click origin survives when no visible range is selected. */
  selectionAnchor: TableCellCoordinates
  selection: TableCellSelection | null
}

export const setActiveTable = StateEffect.define<number | null>()
export const setTableInteraction = StateEffect.define<TableInteraction | null>()

export const clearTableInteractionEffects = () => [
  setActiveTable.of(null),
  setTableInteraction.of(null),
]

/**
 * Controlled updates may map a table start, but coordinates are only safe when
 * the update is strictly separated from the table source. Any overlap or
 * line-concatenating boundary edit deactivates the widget instead of allowing
 * an old target to edit externally replaced data.
 */
function boundaryInsertionPreservesTable(
  state: EditorState,
  block: TableBlock,
  change: { from: number; to: number; insert: string },
): boolean {
  const prospective = state.update({ changes: change }).state
  const mappedFrom = prospective.field(activeTableField, false)
  const mappedBlock = mappedFrom == null ? null : getTableBlockByStart(prospective, mappedFrom)
  return mappedBlock?.source === block.source
}

export function externalChangeInvalidatesTableInteraction(
  state: EditorState,
  change: { from: number; to: number; insert: string },
): boolean {
  const activeFrom = state.field(activeTableField, false)
  const interaction = state.field(tableInteractionField, false)
  if (activeFrom == null && interaction == null) return false
  if (activeFrom == null || interaction == null || activeFrom !== interaction.blockFrom) return true

  const block = getTableBlockByStart(state, activeFrom)
  if (!block) return true

  if (change.from === change.to) {
    if (change.from === block.from) {
      return !change.insert.endsWith('\n') || !boundaryInsertionPreservesTable(state, block, change)
    }
    if (change.from === block.to) {
      return !change.insert.startsWith('\n') || !boundaryInsertionPreservesTable(state, block, change)
    }
    return change.from > block.from && change.from < block.to
  }
  // Boundary replacements can concatenate inserted text with the first or
  // last table line, so only wholly separated ranges are considered safe.
  return change.from <= block.to && change.to >= block.from
}

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
