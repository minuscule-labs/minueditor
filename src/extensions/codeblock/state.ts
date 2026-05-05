import { StateEffect, StateField } from '@codemirror/state'

export const setActiveCodeBlock = StateEffect.define<number | null>()

export const activeCodeBlockField = StateField.define<number | null>({
  create() {
    return null
  },
  update(value, tr) {
    let nextValue = value

    if (nextValue != null) {
      nextValue = tr.changes.mapPos(nextValue, -1)
    }

    for (const effect of tr.effects) {
      if (effect.is(setActiveCodeBlock)) {
        nextValue = effect.value
      }
    }

    return nextValue
  },
})
