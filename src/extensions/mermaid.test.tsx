import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { StrictMode } from 'react'
import { fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownEditor } from '../MarkdownEditor'
import { MarkdownRenderer } from '../renderer'
import type { MermaidEngine } from '../types'
import {
  findMermaidBlocks,
  mermaidSlashCommand,
  normalizeMermaidConfig,
} from './mermaid'

function markdownState(value: string): EditorState {
  return EditorState.create({
    doc: value,
    extensions: [markdown({ base: markdownLanguage })],
  })
}

function fakeEngine(options: { fail?: boolean } = {}) {
  const initialize = vi.fn()
  const renderDiagram = vi.fn(async (_id: string, source: string) => {
    if (options.fail) throw new Error('Diagram syntax is invalid')
    return { svg: `<svg data-testid="diagram"><text>${source.includes('graph TD') ? 'Flow diagram' : 'Diagram'}</text></svg>` }
  })
  const engine: MermaidEngine = { initialize, render: renderDiagram }
  return { engine, initialize, renderDiagram, load: vi.fn(async () => engine) }
}

describe('Mermaid rich blocks', () => {
  it('is opt-in and normalizes host configuration', () => {
    expect(normalizeMermaidConfig(undefined).enabled).toBe(false)
    expect(normalizeMermaidConfig(false).enabled).toBe(false)
    expect(normalizeMermaidConfig(true)).toMatchObject({ enabled: true, theme: 'default' })
    expect(normalizeMermaidConfig({ theme: 'dark' })).toMatchObject({ enabled: true, theme: 'dark' })
  })

  it('finds closed backtick and tilde Mermaid fences only', () => {
    const state = markdownState([
      '```mermaid',
      'graph TD',
      '  A --> B',
      '```',
      '',
      '~~~MERMAID',
      'sequenceDiagram',
      '  A->>B: Hello',
      '~~~',
      '',
      '```js',
      'const value = true',
      '```',
      '',
      '```mermaid',
      'unclosed',
    ].join('\n'))

    const blocks = findMermaidBlocks(state)
    expect(blocks).toHaveLength(2)
    expect(blocks.map((block) => block.source)).toEqual([
      'graph TD\n  A --> B',
      'sequenceDiagram\n  A->>B: Hello',
    ])
  })

  it('renders an inactive diagram and enforces strict Mermaid security', async () => {
    const { load, initialize, renderDiagram } = fakeEngine()
    const { container } = render(
      <MarkdownEditor
        value={'```mermaid\ngraph TD\n  A --> B\n```'}
        onChange={vi.fn()}
        mermaid={{ load, theme: 'dark' }}
      />,
    )

    expect(container.querySelector('.me-mermaid-block--loading')).toBeInTheDocument()
    await waitFor(() => expect(container.querySelector('[data-testid="diagram"]')).toBeInTheDocument())

    expect(load).toHaveBeenCalledOnce()
    expect(initialize).toHaveBeenCalledWith(expect.objectContaining({
      securityLevel: 'strict',
      startOnLoad: false,
      suppressErrorRendering: true,
      theme: 'dark',
    }))
    expect(renderDiagram).toHaveBeenCalledWith(expect.stringMatching(/^me-mermaid-/), 'graph TD\n  A --> B')
    expect(container.querySelector('.me-codeblock-widget')).not.toBeInTheDocument()
  })

  it('reveals exact source from the diagram edit control', async () => {
    const { load } = fakeEngine()
    const value = '```mermaid\ngraph TD\n  A --> B\n```'
    const { container } = render(
      <MarkdownEditor value={value} onChange={vi.fn()} mermaid={{ load }} />,
    )

    const edit = await waitFor(() => container.querySelector('.me-mermaid-edit') as HTMLButtonElement)
    fireEvent.click(edit)

    await waitFor(() => expect(container.querySelector('.me-mermaid-block')).not.toBeInTheDocument())
    expect(container.querySelector('.cm-content')).toHaveTextContent('graph TD')
    expect(container.querySelector('.cm-content')).toHaveTextContent('A --> B')
  })

  it('shows a readable source fallback when rendering fails', async () => {
    const { load } = fakeEngine({ fail: true })
    const { container } = render(
      <MarkdownEditor
        value={'```mermaid\nnot valid\n```'}
        onChange={vi.fn()}
        mermaid={{ load }}
      />,
    )

    await waitFor(() => expect(container.querySelector('.me-mermaid-block--error')).toBeInTheDocument())
    expect(container.querySelector('.me-mermaid-error')).toHaveTextContent('Diagram syntax is invalid')
    expect(container.querySelector('.me-mermaid-source-fallback')).toHaveTextContent('not valid')
  })

  it('keeps exact source visible without loading Mermaid in source mode', () => {
    const { load } = fakeEngine()
    const { container } = render(
      <MarkdownEditor
        value={'```mermaid\ngraph TD\n```'}
        onChange={vi.fn()}
        mode="source"
        mermaid={{ load }}
      />,
    )

    expect(container.querySelector('.cm-content')).toHaveTextContent('```mermaid')
    expect(container.querySelector('.cm-content')).toHaveTextContent('graph TD')
    expect(container.querySelector('.me-mermaid-block')).not.toBeInTheDocument()
    expect(load).not.toHaveBeenCalled()
  })

  it('renders read-only diagrams without an edit control', async () => {
    const { load } = fakeEngine()
    const { container } = render(
      <MarkdownEditor
        value={'```mermaid\ngraph TD\n```'}
        onChange={vi.fn()}
        readOnly
        mermaid={{ load }}
      />,
    )

    await waitFor(() => expect(container.querySelector('[data-testid="diagram"]')).toBeInTheDocument())
    expect(container.querySelector('.me-mermaid-edit')).not.toBeInTheDocument()
  })

  it('keeps Mermaid fences as ordinary code blocks when disabled', async () => {
    const { container } = render(
      <MarkdownEditor value={'```mermaid\ngraph TD\n```'} onChange={vi.fn()} mermaid={false} />,
    )

    await waitFor(() => expect(container.querySelector('.me-codeblock-widget')).toBeInTheDocument())
    expect(container.querySelector('.me-mermaid-block')).not.toBeInTheDocument()
  })

  it('serializes multiple diagrams across Mermaid singleton rendering', async () => {
    let active = 0
    let maxActive = 0
    const engine: MermaidEngine = {
      initialize: vi.fn(),
      async render(_id, source) {
        active += 1
        maxActive = Math.max(maxActive, active)
        await new Promise((resolve) => setTimeout(resolve, 5))
        active -= 1
        return { svg: `<svg data-diagram="${source.trim()}"></svg>` }
      },
    }
    const value = [
      '```mermaid',
      'graph TD',
      '```',
      '',
      '```mermaid',
      'sequenceDiagram',
      '```',
    ].join('\n')
    const { container } = render(
      <StrictMode>
        <MarkdownRenderer value={value} mermaid={{ load: async () => engine }} />
      </StrictMode>,
    )

    await waitFor(() => expect(container.querySelectorAll('[data-diagram]')).toHaveLength(2))
    expect(maxActive).toBe(1)
  })

  it('renders Mermaid in the static renderer with ordinary-code fallback when disabled', async () => {
    const { load } = fakeEngine()
    const value = '```mermaid\ngraph TD\n```'
    const enabled = render(<MarkdownRenderer value={value} mermaid={{ load }} />)

    await waitFor(() => expect(enabled.container.querySelector('[data-testid="diagram"]')).toBeInTheDocument())
    expect(enabled.container.querySelector('pre[data-language="mermaid"]')).not.toBeInTheDocument()
    enabled.unmount()

    const disabled = render(<MarkdownRenderer value={value} />)
    expect(disabled.container.querySelector('pre[data-language="mermaid"]')).toHaveTextContent('graph TD')
    expect(disabled.container.querySelector('.me-mermaid-block')).not.toBeInTheDocument()
  })

  it('inserts an editable Mermaid source block from its slash command', () => {
    const parent = document.createElement('div')
    document.body.appendChild(parent)
    const view = new EditorView({ doc: '/mermaid', parent })
    view.dispatch({ selection: { anchor: view.state.doc.length } })

    expect(mermaidSlashCommand.run(view)).toBe(true)
    expect(view.state.doc.toString()).toBe([
      '```mermaid',
      'graph TD',
      '  A[Start] --> B[End]',
      '```',
    ].join('\n'))
    expect(view.state.selection.main.from).toBe('```mermaid\n'.length)
    view.destroy()
    parent.remove()
  })
})
