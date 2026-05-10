import '@testing-library/jest-dom'

// CM6 requires ResizeObserver — jsdom doesn't include it
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// CM6 uses document.getSelection; provide a no-op in jsdom
if (!window.getSelection) {
  window.getSelection = () => null
}

// CM6 measures text via Range APIs that jsdom only partially implements.
if (typeof Range !== 'undefined') {
  if (!Range.prototype.getBoundingClientRect) {
    Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)
  }

  if (!Range.prototype.getClientRects) {
    Range.prototype.getClientRects = () => {
      const rect = new DOMRect(0, 0, 0, 0)
      return {
        0: rect,
        length: 1,
        item: (index: number) => (index === 0 ? rect : null),
        [Symbol.iterator]: function* iterator() {
          yield rect
        },
      } as unknown as DOMRectList
    }
  }
}
