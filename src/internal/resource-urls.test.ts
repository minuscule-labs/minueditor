import { describe, expect, it, vi } from 'vitest'
import {
  decodeMarkdownResourceDestination,
  encodeResourceUrlForHtmlAttribute,
  escapeHtmlAttribute,
  resolveAndValidateResourceUrl,
  resolveResourceUrl,
  validateResourceUrl,
} from './resource-urls'

describe('resource URL policy', () => {
  it.each([
    ['https://example.com/file', 'http'],
    ['https://example.com/a path', 'http'],
    ['HTTP://example.com/file', 'http'],
    ['/internal/file', 'relative'],
    ['./file', 'relative'],
    ['../file', 'relative'],
    ['file-without-scheme', 'relative'],
    ['?download=true', 'relative'],
    ['#section', 'fragment'],
    ['mailto:person@example.com', 'mailto'],
    ['tel:+15555550123', 'tel'],
    ['blob:https://example.com/id', 'blob'],
    ['//cdn.example.com/file', 'protocol-relative'],
  ] as const)('allows link destination %s as %s', (url, category) => {
    expect(validateResourceUrl(url, 'link')).toEqual({ allowed: true, url, category })
  })

  it.each([
    ['https://example.com/image.png', 'http'],
    ['/internal/image.png', 'relative'],
    ['./image.png', 'relative'],
    ['blob:https://example.com/id', 'blob'],
    ['//cdn.example.com/image.png', 'protocol-relative'],
  ] as const)('allows image destination %s as %s', (url, category) => {
    expect(validateResourceUrl(url, 'image')).toEqual({ allowed: true, url, category })
  })

  it.each(['#section', 'mailto:person@example.com', 'tel:+15555550123'])(
    'denies kind-specific image destination %s',
    (url) => {
      expect(validateResourceUrl(url, 'image')).toEqual({
        allowed: false,
        reason: 'disallowed-for-kind',
      })
    },
  )

  it.each([
    'data:image/png;base64,AA==',
    'data:image/svg+xml,<svg></svg>',
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'vbscript:msgbox(1)',
    'file:///tmp/file',
    'ftp://example.com/file',
    'custom:resource',
  ])('denies explicit scheme %s', (url) => {
    expect(validateResourceUrl(url, 'link')).toEqual({
      allowed: false,
      reason: 'disallowed-scheme',
    })
    expect(validateResourceUrl(url, 'image')).toEqual({
      allowed: false,
      reason: 'disallowed-scheme',
    })
  })

  it.each([
    ' javascript:alert(1)',
    'java\nscript:alert(1)',
    'java\tscript:alert(1)',
    'java script:alert(1)',
    '\\\\cdn.example.com/file',
    '/\\cdn.example.com/file',
  ])('rejects control, whitespace, or backslash-obfuscated destination %j', (url) => {
    expect(validateResourceUrl(url, 'link')).toEqual({
      allowed: false,
      reason: 'invalid-characters',
    })
  })

  it('classifies protocol-relative URLs before ordinary root-relative paths', () => {
    expect(validateResourceUrl('//cdn.example.com/file', 'link')).toMatchObject({
      allowed: true,
      category: 'protocol-relative',
    })
    expect(validateResourceUrl('/internal/file', 'link')).toMatchObject({
      allowed: true,
      category: 'relative',
    })
  })

  it('allows an empty parsed destination as a document-relative compatibility case', () => {
    expect(validateResourceUrl('', 'link')).toEqual({
      allowed: true,
      url: '',
      category: 'relative',
    })
  })
})

describe('resource URL resolution', () => {
  it('uses identity resolution when no callback is supplied', () => {
    expect(resolveResourceUrl('/canonical', 'image')).toEqual({
      url: '/canonical',
      usedFallback: false,
    })
  })

  it('passes the canonical source and kind to the resolver exactly once', () => {
    const resolver = vi.fn(() => 'https://api.example.com/runtime')

    expect(resolveResourceUrl('/canonical', 'link', resolver)).toEqual({
      url: 'https://api.example.com/runtime',
      usedFallback: false,
    })
    expect(resolver).toHaveBeenCalledOnce()
    expect(resolver).toHaveBeenCalledWith('/canonical', { kind: 'link' })
  })

  it('falls back to the canonical destination when the resolver throws', () => {
    const resolver = vi.fn(() => {
      throw new Error('failed')
    })

    expect(resolveResourceUrl('/canonical', 'image', resolver)).toEqual({
      url: '/canonical',
      usedFallback: true,
    })
  })

  it('falls back when an untyped resolver returns a non-string value', () => {
    const resolver = (() => undefined) as unknown as (
      source: string,
      context: { kind: 'link' | 'image' },
    ) => string

    expect(resolveResourceUrl('/canonical', 'link', resolver)).toEqual({
      url: '/canonical',
      usedFallback: true,
    })
  })

  it('validates resolver output rather than trusting the host callback', () => {
    const result = resolveAndValidateResourceUrl(
      '/canonical',
      'link',
      () => 'javascript:alert(1)',
    )

    expect(result).toEqual({
      canonicalUrl: '/canonical',
      resolvedUrl: 'javascript:alert(1)',
      usedFallback: false,
      validation: { allowed: false, reason: 'disallowed-scheme' },
    })
  })

  it('validates the canonical fallback after a resolver exception', () => {
    const result = resolveAndValidateResourceUrl('file:///private', 'link', () => {
      throw new Error('failed')
    })

    expect(result.usedFallback).toBe(true)
    expect(result.validation).toEqual({ allowed: false, reason: 'disallowed-scheme' })
  })
})

describe('parsed Markdown resource destinations', () => {
  it('decodes named and numeric HTML character references before resolution', () => {
    expect(
      decodeMarkdownResourceDestination('https://example.com/?a=1&amp;b=&#x32;'),
    ).toBe('https://example.com/?a=1&b=2')
    expect(decodeMarkdownResourceDestination('java&#x73;cript&colon;alert(1)')).toBe(
      'javascript:alert(1)',
    )
  })
})

describe('resource URL HTML attribute escaping', () => {
  it('escapes every attribute-sensitive character', () => {
    expect(escapeHtmlAttribute('https://example.com/?a=1&b="<tag>\'')).toBe(
      'https://example.com/?a=1&amp;b=&quot;&lt;tag&gt;&#39;',
    )
  })

  it('URI-encodes destinations without double-encoding existing percent escapes', () => {
    expect(
      encodeResourceUrlForHtmlAttribute('https://example.com/a path?q=%22&next=<tag>'),
    ).toBe('https://example.com/a%20path?q=%22&amp;next=%3Ctag%3E')
  })

  it('fails closed when encodeURI rejects malformed Unicode', () => {
    expect(encodeResourceUrlForHtmlAttribute('\ud800')).toBeNull()
  })
})
