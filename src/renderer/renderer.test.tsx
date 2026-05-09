import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { MarkdownRenderer } from './index'

describe('MarkdownRenderer', () => {
  it('renders markdown as HTML', () => {
    render(<MarkdownRenderer value={'# Hello\n\n**bold** and *italic*'} />)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hello')
  })

  it('renders inline formatting', () => {
    const { container } = render(
      <MarkdownRenderer value={'**bold** and *italic* and ~~strike~~'} />
    )
    expect(container.querySelector('strong')).toHaveTextContent('bold')
    expect(container.querySelector('em')).toHaveTextContent('italic')
    expect(container.querySelector('del')).toHaveTextContent('strike')
  })

  it('renders code blocks', () => {
    render(<MarkdownRenderer value={'```\nconst x = 1\n```'} />)
    expect(screen.getByText('const x = 1')).toBeInTheDocument()
  })

  it('upgrades fenced code blocks to shiki when a language is present', async () => {
    const { container } = render(<MarkdownRenderer value={'```ts\nconst x = 1\n```'} />)
    await waitFor(() => {
      expect(container.querySelector('pre.shiki')).toBeInTheDocument()
    })
  })

  it('renders inline code', () => {
    const { container } = render(<MarkdownRenderer value={'Use `foo()` here'} />)
    expect(container.querySelector('code')).toHaveTextContent('foo()')
  })

  it('renders a blockquote', () => {
    const { container } = render(<MarkdownRenderer value={'> Quote text'} />)
    expect(container.querySelector('blockquote')).toBeInTheDocument()
  })

  it('renders unordered and ordered lists', () => {
    const { container } = render(
      <MarkdownRenderer value={'- item one\n- item two\n\n1. first\n2. second'} />
    )
    expect(container.querySelector('ul')).toBeInTheDocument()
    expect(container.querySelector('ol')).toBeInTheDocument()
  })

  it('has button role and calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<MarkdownRenderer value={'Hello'} onClick={onClick} />)
    fireEvent.click(screen.getByRole('button'))
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('fires onClick on Enter key', () => {
    const onClick = vi.fn()
    render(<MarkdownRenderer value={'Hello'} onClick={onClick} />)
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Enter' })
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('fires onClick on Space key', () => {
    const onClick = vi.fn()
    render(<MarkdownRenderer value={'Hello'} onClick={onClick} />)
    fireEvent.keyDown(screen.getByRole('button'), { key: ' ' })
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('does not fire onClick on unrelated keys', () => {
    const onClick = vi.fn()
    render(<MarkdownRenderer value={'Hello'} onClick={onClick} />)
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' })
    expect(onClick).not.toHaveBeenCalled()
  })

  it('has no role or tabIndex when onClick is not provided', () => {
    const { container } = render(<MarkdownRenderer value={'Hello'} />)
    const div = container.firstElementChild!
    expect(div).not.toHaveAttribute('role')
    expect(div).not.toHaveAttribute('tabindex')
  })

  it('applies className alongside me-renderer', () => {
    const { container } = render(
      <MarkdownRenderer value={'Hi'} className={'custom'} />
    )
    expect(container.firstElementChild).toHaveClass('me-renderer', 'custom')
  })

  it('renders task list checkboxes', () => {
    render(<MarkdownRenderer value={'- [x] Done\n- [ ] Todo'} />)
    const checkboxes = screen.getAllByRole('checkbox')
    expect(checkboxes).toHaveLength(2)
    expect(checkboxes[0]).toBeChecked()
    expect(checkboxes[1]).not.toBeChecked()
  })

  it('checkboxes are not togglable in the renderer', () => {
    render(<MarkdownRenderer value={'- [ ] Todo'} />)
    const checkbox = screen.getByRole('checkbox')
    expect(checkbox).not.toBeChecked()
    fireEvent.click(checkbox)
    // click is prevented — still unchecked
    expect(checkbox).not.toBeChecked()
  })
})
