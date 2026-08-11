import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownRenderer } from './index'
import type { ResourceUrlResolver } from '../types'

function attachmentResolver(origin: string): ResourceUrlResolver {
  return (source) => source.startsWith('/internal/') ? `${origin}${source}` : source
}

describe('MarkdownRenderer resourceUrlResolver', () => {
  it('resolves standard Markdown links and images without changing canonical input', () => {
    const value = [
      '[download](/internal/attachments/att_link/content)',
      '',
      '![diagram](/internal/attachments/att_image/content)',
    ].join('\n')
    const resolver = attachmentResolver('https://api.example.com')
    const { container } = render(
      <MarkdownRenderer value={value} resourceUrlResolver={resolver} />,
    )

    expect(container.querySelector('a')).toHaveAttribute(
      'href',
      'https://api.example.com/internal/attachments/att_link/content',
    )
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      'https://api.example.com/internal/attachments/att_image/content',
    )
    expect(value).toContain('/internal/attachments/att_link/content')
    expect(value).toContain('/internal/attachments/att_image/content')
  })

  it('supplies the parsed destination and resource kind', () => {
    const resolver = vi.fn((source: string) => source)
    render(
      <MarkdownRenderer
        value={'[link](<https://example.com/a path>)\n\n![image](/image.png "Title")'}
        resourceUrlResolver={resolver}
      />,
    )

    expect(resolver).toHaveBeenCalledWith('https://example.com/a path', { kind: 'link' })
    expect(resolver).toHaveBeenCalledWith('/image.png', { kind: 'image' })
  })

  it('decodes Markdown character references before resolution', () => {
    const resolver = vi.fn((source: string) => source)
    const { container } = render(
      <MarkdownRenderer
        value={'[query](https://example.com/?a=1&amp;b=2)'}
        resourceUrlResolver={resolver}
      />,
    )

    expect(resolver).toHaveBeenCalledWith('https://example.com/?a=1&b=2', { kind: 'link' })
    expect(container.querySelector('a')).toHaveAttribute(
      'href',
      'https://example.com/?a=1&b=2',
    )
  })

  it('uses identity resolution when the prop is omitted', () => {
    const { container } = render(
      <MarkdownRenderer value={'[download](/internal/file)\n\n![image](./image.png)'} />,
    )

    expect(container.querySelector('a')).toHaveAttribute('href', '/internal/file')
    expect(container.querySelector('img')).toHaveAttribute('src', './image.png')
  })

  it('falls back to canonical destinations when the resolver throws', () => {
    const resolver = () => {
      throw new Error('resolver failed')
    }
    const { container } = render(
      <MarkdownRenderer
        value={'[download](/internal/file)\n\n![image](/internal/image.png)'}
        resourceUrlResolver={resolver}
      />,
    )

    expect(container.querySelector('a')).toHaveAttribute('href', '/internal/file')
    expect(container.querySelector('img')).toHaveAttribute('src', '/internal/image.png')
  })

  it('validates unsafe canonical and resolver-produced destinations', () => {
    const { container, rerender } = render(
      <MarkdownRenderer
        value={'[unsafe](/safe)\n\n![unsafe image](/safe.png)'}
        resourceUrlResolver={() => 'javascript:alert(1)'}
      />,
    )

    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('unsafe')
    expect(container).toHaveTextContent('unsafe image')

    rerender(
      <MarkdownRenderer value={'[canonical](javascript:alert(1))'} />,
    )
    expect(container.querySelector('a')).toBeNull()
    expect(container).toHaveTextContent('canonical')

    rerender(
      <MarkdownRenderer value={'[encoded](java&#x73;cript&colon;alert(1))'} />,
    )
    expect(container.querySelector('a')).toBeNull()
    expect(container).toHaveTextContent('encoded')
  })

  it('URI-encodes attribute delimiters in resolver output', () => {
    const { container } = render(
      <MarkdownRenderer
        value={'[link](/canonical)\n\n![image](/canonical.png)'}
        resourceUrlResolver={(_, { kind }) =>
          kind === 'link'
            ? 'https://example.com/?q=" onmouseover="x&tag=<tag>'
            : 'https://example.com/image " onerror="x<tag>.png'
        }
      />,
    )
    const link = container.querySelector('a')
    const image = container.querySelector('img')

    expect(link?.getAttribute('href')).toContain('%22%20onmouseover=%22x&tag=%3Ctag%3E')
    expect(link).not.toHaveAttribute('onmouseover')
    expect(image?.getAttribute('src')).toContain('%22%20onerror=%22x%3Ctag%3E.png')
    expect(image).not.toHaveAttribute('onerror')
  })

  it('resolves reference-style links and both autolink forms in static rendering', () => {
    const resolver = vi.fn((source: string) => source)
    const value = [
      '[reference][id]',
      '',
      '<https://example.com/angle>',
      '',
      'https://example.com/bare',
      '',
      '[id]: /reference',
    ].join('\n')
    render(<MarkdownRenderer value={value} resourceUrlResolver={resolver} />)

    expect(resolver).toHaveBeenCalledWith('/reference', { kind: 'link' })
    expect(resolver).toHaveBeenCalledWith('https://example.com/angle', { kind: 'link' })
    expect(resolver).toHaveBeenCalledWith('https://example.com/bare', { kind: 'link' })
  })

  it('does not resolve destinations inside raw HTML', () => {
    const resolver = vi.fn((source: string) => `https://api.example.com${source}`)
    const { container } = render(
      <MarkdownRenderer
        value={'<a href="/raw">raw</a><img src="/raw.png" alt="raw image">'}
        resourceUrlResolver={resolver}
      />,
    )

    expect(container.querySelector('a')).toHaveAttribute('href', '/raw')
    expect(container.querySelector('img')).toHaveAttribute('src', '/raw.png')
    expect(resolver).not.toHaveBeenCalled()
  })

  it('keeps wikilinks outside the resource resolver pipeline', () => {
    const resolver = vi.fn((source: string) => source)
    const { container } = render(
      <MarkdownRenderer value={'See [[Project Alpha]].'} resourceUrlResolver={resolver} />,
    )

    expect(container).toHaveTextContent('See [[Project Alpha]].')
    expect(resolver).not.toHaveBeenCalled()
  })

  it('isolates resolvers across renderer instances and rerenders', () => {
    const value = '[download](/internal/file)'
    const rendererA = render(
      <MarkdownRenderer
        value={value}
        resourceUrlResolver={attachmentResolver('https://api-a.example')}
      />,
    )
    const rendererB = render(
      <MarkdownRenderer
        value={value}
        resourceUrlResolver={attachmentResolver('https://api-b.example')}
      />,
    )

    expect(rendererA.container.querySelector('a')).toHaveAttribute(
      'href',
      'https://api-a.example/internal/file',
    )
    expect(rendererB.container.querySelector('a')).toHaveAttribute(
      'href',
      'https://api-b.example/internal/file',
    )

    rendererA.rerender(
      <MarkdownRenderer
        value={value}
        resourceUrlResolver={attachmentResolver('https://api-a2.example')}
      />,
    )
    expect(rendererA.container.querySelector('a')).toHaveAttribute(
      'href',
      'https://api-a2.example/internal/file',
    )
    expect(rendererB.container.querySelector('a')).toHaveAttribute(
      'href',
      'https://api-b.example/internal/file',
    )

    rendererA.unmount()
    expect(rendererB.container.querySelector('a')).toHaveAttribute(
      'href',
      'https://api-b.example/internal/file',
    )
  })
})
