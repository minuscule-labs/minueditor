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
