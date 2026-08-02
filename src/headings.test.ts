import { describe, expect, it } from 'vitest'
import { parseMarkdownHeadings, slugifyMarkdownHeading } from './headings'

describe('Markdown headings', () => {
  it('enumerates ATX and setext headings with source ranges', () => {
    const value = '# First heading\n\nSecond heading\n==============\n\n### Third\n'

    expect(parseMarkdownHeadings(value)).toEqual([
      {
        level: 1,
        text: 'First heading',
        from: 0,
        to: 15,
        contentFrom: 2,
        contentTo: 15,
        slug: 'first-heading',
      },
      {
        level: 1,
        text: 'Second heading',
        from: 17,
        to: 46,
        contentFrom: 17,
        contentTo: 31,
        slug: 'second-heading',
      },
      {
        level: 3,
        text: 'Third',
        from: 48,
        to: 57,
        contentFrom: 52,
        contentTo: 57,
        slug: 'third',
      },
    ])
  })

  it('uses visible inline text and omits explicit link destinations', () => {
    const [heading] = parseMarkdownHeadings(
      '# **Bold** and [linked text](https://example.com) with `code` and ~~strike~~\n',
    )

    expect(heading.text).toBe('Bold and linked text with code and strike')
    expect(heading.slug).toBe('bold-and-linked-text-with-code-and-strike')
  })

  it('disambiguates duplicate, colliding, and empty slugs in document order', () => {
    const headings = parseMarkdownHeadings(
      '# Duplicate\n## Duplicate\n### Duplicate!\n# Duplicate-1\n# 🎉\n## 🎉\n',
    )

    expect(headings.map((heading) => heading.slug)).toEqual([
      'duplicate',
      'duplicate-1',
      'duplicate-2',
      'duplicate-1-1',
      'section',
      'section-1',
    ])
  })

  it('omits optional closing ATX markers from content and display text', () => {
    const [heading] = parseMarkdownHeadings('## Authored heading ##\n')
    expect(heading).toMatchObject({
      text: 'Authored heading',
      contentFrom: 3,
      contentTo: 19,
      slug: 'authored-heading',
    })
  })

  it('preserves Unicode letters and removes punctuation from slugs', () => {
    expect(slugifyMarkdownHeading('  Café 東京 — Plans!  ')).toBe('café-東京-plans')
  })

  it('does not treat headings inside fenced code as document headings', () => {
    const headings = parseMarkdownHeadings('```md\n# Not a heading\n```\n\n# Real heading\n')
    expect(headings.map((heading) => heading.text)).toEqual(['Real heading'])
  })
})
