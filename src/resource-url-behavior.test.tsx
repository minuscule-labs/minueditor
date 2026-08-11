import { render, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MarkdownEditor } from './MarkdownEditor'
import { MarkdownRenderer } from './renderer'

function linksByLabel(container: HTMLElement): Map<string, HTMLAnchorElement> {
  return new Map(
    Array.from(container.querySelectorAll<HTMLAnchorElement>('a')).map((link) => [
      link.textContent ?? '',
      link,
    ]),
  )
}

describe('resource URL behavior', () => {
  describe('MarkdownRenderer', () => {
    it('renders the accepted link destination forms', () => {
      const value = [
        '[root](/root)',
        '[document](./document)',
        '[fragment](#fragment)',
        '[mail](mailto:person@example.com)',
        '[telephone](tel:+15555550123)',
        '[blob](blob:https://example.com/link-id)',
        '[protocol-relative](//cdn.example.com/file)',
      ].join('\n\n')
      const { container } = render(<MarkdownRenderer value={value} />)
      const links = linksByLabel(container)

      expect(links.get('root')).toHaveAttribute('href', '/root')
      expect(links.get('document')).toHaveAttribute('href', './document')
      expect(links.get('fragment')).toHaveAttribute('href', '#fragment')
      expect(links.get('mail')).toHaveAttribute('href', 'mailto:person@example.com')
      expect(links.get('telephone')).toHaveAttribute('href', 'tel:+15555550123')
      expect(links.get('blob')).toHaveAttribute('href', 'blob:https://example.com/link-id')
      expect(links.get('protocol-relative')).toHaveAttribute('href', '//cdn.example.com/file')
    })

    it('allows accepted image forms and blocks data or executable destinations', () => {
      const value = [
        '![root](/root.png)',
        '![document](./document.png)',
        '![blob](blob:https://example.com/image-id)',
        '![data](data:image/png;base64,AA==)',
        '![unsafe](javascript:alert(1))',
      ].join('\n\n')
      const { container } = render(<MarkdownRenderer value={value} />)
      const images = new Map(
        Array.from(container.querySelectorAll<HTMLImageElement>('img')).map((image) => [
          image.alt,
          image,
        ]),
      )

      expect(images.get('root')).toHaveAttribute('src', '/root.png')
      expect(images.get('document')).toHaveAttribute('src', './document.png')
      expect(images.get('blob')).toHaveAttribute('src', 'blob:https://example.com/image-id')
      expect(images.get('data')).toBeUndefined()
      expect(images.get('unsafe')).toBeUndefined()
      expect(container).toHaveTextContent('data')
      expect(container).toHaveTextContent('unsafe')
    })

    it('blocks executable Markdown link destinations while preserving the label', () => {
      const { container } = render(
        <MarkdownRenderer value={'[unsafe](javascript:alert(1))'} />,
      )

      expect(container.querySelector('a')).toBeNull()
      expect(container).toHaveTextContent('unsafe')
    })

    it('renders reference-style links and both autolink forms as anchors', () => {
      const value = [
        '[reference][resource]',
        '',
        '<https://example.com/angle>',
        '',
        'https://example.com/bare',
        '',
        '[resource]: /reference "Reference title"',
      ].join('\n')
      const { container } = render(<MarkdownRenderer value={value} />)
      const links = linksByLabel(container)

      expect(links.get('reference')).toHaveAttribute('href', '/reference')
      expect(links.get('reference')).toHaveAttribute('title', 'Reference title')
      expect(links.get('https://example.com/angle')).toHaveAttribute(
        'href',
        'https://example.com/angle',
      )
      expect(links.get('https://example.com/bare')).toHaveAttribute(
        'href',
        'https://example.com/bare',
      )
    })

    it('preserves raw HTML destinations separately from Markdown destinations', () => {
      const { container } = render(
        <MarkdownRenderer
          value={'<a href="/raw-link">raw</a><img src="/raw-image.png" alt="raw image">'}
        />,
      )

      expect(screenLink(container, 'raw')).toHaveAttribute('href', '/raw-link')
      expect(container.querySelector('img[alt="raw image"]')).toHaveAttribute(
        'src',
        '/raw-image.png',
      )
    })

    it('parses image titles, angle brackets, and balanced parentheses correctly', () => {
      const value = [
        '![title](/image.png "Diagram")',
        '![angle](<https://example.com/image with spaces.png>)',
        '![parentheses](https://example.com/image_(large).png)',
      ].join('\n\n')
      const { container } = render(<MarkdownRenderer value={value} />)
      const images = new Map(
        Array.from(container.querySelectorAll<HTMLImageElement>('img')).map((image) => [
          image.alt,
          image,
        ]),
      )

      expect(images.get('title')).toHaveAttribute('src', '/image.png')
      expect(images.get('title')).toHaveAttribute('title', 'Diagram')
      expect(images.get('angle')).toHaveAttribute(
        'src',
        'https://example.com/image%20with%20spaces.png',
      )
      expect(images.get('parentheses')).toHaveAttribute(
        'src',
        'https://example.com/image_(large).png',
      )
    })

    it('keeps encoded quote characters inside destination attributes', () => {
      const value = [
        '[link](https://example.com/?q=&quot;onmouseover=&quot;x)',
        '',
        '![image](https://example.com/?q=&quot;onerror=&quot;x)',
      ].join('\n')
      const { container } = render(<MarkdownRenderer value={value} />)
      const link = container.querySelector('a')
      const image = container.querySelector('img')

      expect(link).toHaveAttribute('href', 'https://example.com/?q=%22onmouseover=%22x')
      expect(link).not.toHaveAttribute('onmouseover')
      expect(image).toHaveAttribute('src', 'https://example.com/?q=%22onerror=%22x')
      expect(image).not.toHaveAttribute('onerror')
    })
  })

  describe('MarkdownEditor live mode', () => {
    it('widgets both HTTP and root-relative inline links', async () => {
      const http = render(
        <MarkdownEditor value={'Before\n\n[http](https://example.com)'} onChange={vi.fn()} />,
      )
      await waitFor(() => expect(http.container.querySelector('.me-link-widget')).toBeTruthy())
      http.unmount()

      const relative = render(
        <MarkdownEditor value={'Before\n\n[root](/internal/resource)'} onChange={vi.fn()} />,
      )
      const widget = await waitFor(
        () => relative.container.querySelector('.me-link-widget') as HTMLElement,
      )
      expect(widget.dataset.meLinkUrl).toBe('/internal/resource')
    })

    it('does not add live widgets for reference-style links or autolinks', async () => {
      const value = [
        'Before',
        '',
        '[reference][resource]',
        '',
        '<https://example.com/angle>',
        '',
        'https://example.com/bare',
        '',
        '[resource]: /reference',
      ].join('\n')
      const { container } = render(<MarkdownEditor value={value} onChange={vi.fn()} />)

      await waitFor(() => expect(container.querySelector('.cm-content')).toBeTruthy())
      expect(container.querySelector('.me-link-widget')).toBeFalsy()
    })

    it('separates an optional image title from the widget destination', async () => {
      const { container } = render(
        <MarkdownEditor value={'![title](/image.png "Diagram")'} onChange={vi.fn()} />,
      )
      const image = await waitFor(() => container.querySelector('.me-image') as HTMLImageElement)

      expect(image).toHaveAttribute('src', '/image.png')
      expect(image).toHaveAttribute('title', 'Diagram')
    })

    it('renders live image destinations with balanced parentheses', async () => {
      const { container } = render(
        <MarkdownEditor
          value={'![parentheses](https://example.com/image_(large).png)'}
          onChange={vi.fn()}
        />,
      )

      const image = await waitFor(() => container.querySelector('.me-image') as HTMLImageElement)
      expect(image).toHaveAttribute('src', 'https://example.com/image_(large).png')
    })

    it('widgets titled links and complete balanced-parenthesis destinations', async () => {
      const titled = render(
        <MarkdownEditor
          value={'Before\n\n[title](https://example.com "Example")'}
          onChange={vi.fn()}
        />,
      )
      const titledWidget = await waitFor(
        () => titled.container.querySelector('.me-link-widget') as HTMLElement,
      )
      expect(titledWidget.dataset.meLinkUrl).toBe('https://example.com')
      titled.unmount()

      const parenthesized = render(
        <MarkdownEditor
          value={'Before\n\n[parentheses](https://example.com/a_(b))'}
          onChange={vi.fn()}
        />,
      )
      const widget = await waitFor(
        () => parenthesized.container.querySelector('.me-link-widget') as HTMLElement,
      )
      expect(widget.dataset.meLinkUrl).toBe('https://example.com/a_(b)')
    })
  })
})

function screenLink(container: HTMLElement, label: string): HTMLAnchorElement | undefined {
  return Array.from(container.querySelectorAll<HTMLAnchorElement>('a')).find(
    (link) => link.textContent === label,
  )
}
