import { useMemo, useState } from 'react'
import { MarkdownEditor, MarkdownRenderer } from '../../src/index'
import type { MermaidEngine } from '../../src/types'

const value = [
  '# Mermaid loading stability',
  ...Array.from({ length: 24 }, (_, index) => [
    '```mermaid',
    'graph TD',
    `  A[Diagram ${index + 1}] --> B[More detail] --> C[Done]`,
    ...Array.from({ length: 12 }, (_, step) => `  N${step} --> N${step + 1}`),
    '```',
  ].join('\n')),
  'Reading position after the diagrams.',
  ...Array.from({ length: 80 }, (_, index) => `Trailing paragraph ${index + 1}.`),
].join('\n\n')

export function MermaidScrollFixture() {
  const params = new URLSearchParams(window.location.search)
  const surface = params.get('surface') ?? 'editor'
  const real = params.has('real')
  const fail = params.has('fail')
  const [pending, setPending] = useState(0)
  const [renders, setRenders] = useState(0)
  const mermaid = useMemo(() => ({
    load: async (): Promise<MermaidEngine> => {
      const engine = real ? (await import('mermaid')).default : null
      return {
        initialize(config) { engine?.initialize(config) },
        async render(id, source, container) {
          const measurement = document.createElement('div')
          measurement.dataset.testid = 'mermaid-measurement'
          measurement.style.height = '1800px'
          ;(container ?? document.body).appendChild(measurement)
          setPending((count) => count + 1)
          setRenders((count) => count + 1)
          try {
            await new Promise<void>((resolve) => {
              window.addEventListener('render-next-mermaid', () => resolve(), { once: true })
            })
            if (fail) throw new Error('Invalid diagram')
            if (engine) return await engine.render(id, source, container)
            return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="640" viewBox="0 0 600 640"><text x="20" y="30">${source.match(/Diagram \d+/)?.[0]}</text></svg>` }
          } finally {
            measurement.remove()
            setPending((count) => count - 1)
          }
        },
      }
    },
  }), [real, fail])

  return (
    <main className="app-main" data-testid="mermaid-scroll-fixture">
      <output data-testid="pending-diagrams">{pending}</output>
      <output data-testid="diagram-renders">{renders}</output>
      {surface.endsWith('renderer') ? (
        <div style={surface === 'renderer' ? { height: 480, overflowY: 'auto' } : undefined} data-testid="renderer-scroll">
          <MarkdownRenderer value={value} mermaid={mermaid} />
        </div>
      ) : (
        <div style={surface === 'parent-editor' ? { height: 480, overflowY: 'auto' } : undefined} data-testid="parent-scroll">
          <MarkdownEditor
            value={value}
            onChange={() => undefined}
            mermaid={mermaid}
            {...(surface === 'editor' ? { maxHeight: 480 } : {})}
          />
        </div>
      )}
    </main>
  )
}
