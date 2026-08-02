import { describe, expect, it, vi } from 'vitest'
import { focusElementWithoutScroll, widgetBoundaryPosition } from './widget-navigation'

describe('widget navigation', () => {
  it('focuses nested widget controls without asking the browser to scroll them', () => {
    const input = document.createElement('input')
    const focus = vi.spyOn(input, 'focus')

    focusElementWithoutScroll(input)

    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  })

  it('maps source boundaries deterministically', () => {
    expect(widgetBoundaryPosition({ from: 10, to: 30 }, 'before')).toBe(10)
    expect(widgetBoundaryPosition({ from: 10, to: 30 }, 'after')).toBe(30)
  })
})
