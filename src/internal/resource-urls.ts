import { decodeHTMLStrict } from 'entities/decode'
import type { ResourceKind, ResourceUrlResolver } from '../types'

export type ResourceUrlCategory =
  | 'http'
  | 'relative'
  | 'fragment'
  | 'mailto'
  | 'tel'
  | 'blob'
  | 'protocol-relative'

export type ResourceUrlDenialReason =
  | 'disallowed-for-kind'
  | 'disallowed-scheme'
  | 'invalid-characters'

export type ResourceUrlValidation =
  | {
      allowed: true
      url: string
      category: ResourceUrlCategory
    }
  | {
      allowed: false
      reason: ResourceUrlDenialReason
    }

export interface ResolvedResourceUrl {
  canonicalUrl: string
  resolvedUrl: string
  usedFallback: boolean
  validation: ResourceUrlValidation
}

const schemePattern = /^([A-Za-z][A-Za-z0-9+.-]*):/
const invalidUrlCharacters = /[\u0000-\u001f\u007f\\]/

/** Decodes CommonMark HTML character references in a parsed destination. */
export function decodeMarkdownResourceDestination(source: string): string {
  return decodeHTMLStrict(source)
}

/**
 * Runs a host resolver without allowing callback failures or invalid return
 * values to break rendering. Resolver output is validated separately.
 */
export function resolveResourceUrl(
  source: string,
  kind: ResourceKind,
  resolver?: ResourceUrlResolver,
): { url: string; usedFallback: boolean } {
  if (!resolver) return { url: source, usedFallback: false }

  try {
    const resolved = resolver(source, { kind })
    if (typeof resolved === 'string') {
      return { url: resolved, usedFallback: false }
    }
  } catch {
    // Resolver failures intentionally fall back to the canonical destination.
  }

  return { url: source, usedFallback: true }
}

/**
 * Applies the accepted standard-Markdown destination policy. Raw HTML is not
 * passed through this helper.
 */
export function validateResourceUrl(
  url: string,
  kind: ResourceKind,
): ResourceUrlValidation {
  if (invalidUrlCharacters.test(url) || url.trim() !== url) {
    return { allowed: false, reason: 'invalid-characters' }
  }

  const firstColon = url.indexOf(':')
  if (firstColon >= 0 && /\s/.test(url.slice(0, firstColon))) {
    return { allowed: false, reason: 'invalid-characters' }
  }

  if (url.startsWith('//')) {
    return { allowed: true, url, category: 'protocol-relative' }
  }

  if (url.startsWith('#')) {
    return kind === 'link'
      ? { allowed: true, url, category: 'fragment' }
      : { allowed: false, reason: 'disallowed-for-kind' }
  }

  const scheme = schemePattern.exec(url)?.[1]?.toLowerCase()
  if (!scheme) {
    return { allowed: true, url, category: 'relative' }
  }

  if (scheme === 'http' || scheme === 'https') {
    return { allowed: true, url, category: 'http' }
  }

  if (scheme === 'blob') {
    return { allowed: true, url, category: 'blob' }
  }

  if (scheme === 'mailto' || scheme === 'tel') {
    return kind === 'link'
      ? { allowed: true, url, category: scheme }
      : { allowed: false, reason: 'disallowed-for-kind' }
  }

  return { allowed: false, reason: 'disallowed-scheme' }
}

export function resolveAndValidateResourceUrl(
  source: string,
  kind: ResourceKind,
  resolver?: ResourceUrlResolver,
): ResolvedResourceUrl {
  const resolved = resolveResourceUrl(source, kind, resolver)
  return {
    canonicalUrl: source,
    resolvedUrl: resolved.url,
    usedFallback: resolved.usedFallback,
    validation: validateResourceUrl(resolved.url, kind),
  }
}

/** Escapes text for interpolation into a double-quoted HTML attribute. */
export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Applies Marked-compatible URI encoding and HTML attribute escaping. Returns
 * null when JavaScript cannot encode a malformed destination.
 */
export function encodeResourceUrlForHtmlAttribute(value: string): string | null {
  try {
    const encoded = encodeURI(value).replace(/%25([0-9a-f]{2})/gi, '%$1')
    return escapeHtmlAttribute(encoded)
  } catch {
    return null
  }
}
