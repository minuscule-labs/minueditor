import { StateEffect, StateField } from '@codemirror/state'

export const setActiveTable = StateEffect.define<number | null>()

export const activeTableField = StateField.define<number | null>({
  create() {
    return null
  },
  update(value, tr) {
    let nextValue = value
    if (nextValue != null) nextValue = tr.changes.mapPos(nextValue, -1)
    for (const effect of tr.effects) {
      if (effect.is(setActiveTable)) nextValue = effect.value
    }
    return nextValue
  },
})
