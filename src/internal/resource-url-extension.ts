import { Facet } from '@codemirror/state'
import type { ResourceUrlResolver } from '../types'

export interface ResourceUrlConfig {
  resolver: ResourceUrlResolver | undefined
  generation: number
}

const defaultResourceUrlConfig: ResourceUrlConfig = {
  resolver: undefined,
  generation: 0,
}

export const resourceUrlConfigFacet = Facet.define<
  ResourceUrlConfig,
  ResourceUrlConfig
>({
  combine(values) {
    return values[values.length - 1] ?? defaultResourceUrlConfig
  },
})
