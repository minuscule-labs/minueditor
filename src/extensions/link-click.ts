import { EditorView } from '@codemirror/view'
import { markdownResourceAt } from '../internal/markdown-resources'
import { resourceUrlConfigFacet } from '../internal/resource-url-extension'
import { resolveAndValidateResourceUrl } from '../internal/resource-urls'

export const linkClickNavigation = EditorView.domEventHandlers({
  click(event, view) {
    if ((!event.metaKey && !event.ctrlKey) || event.altKey || event.shiftKey) return false

    const pos = view.posAtCoords({ x: event.clientX, y: event.clientY })
    if (pos == null) return false

    const resource = markdownResourceAt(view.state, pos, 'link')
    if (!resource) return false

    const config = view.state.facet(resourceUrlConfigFacet)
    const resolved = resolveAndValidateResourceUrl(
      resource.destination,
      'link',
      config.resolver,
    )
    if (!resolved.validation.allowed) return false

    event.preventDefault()
    window.open(resolved.validation.url, '_blank', 'noopener,noreferrer')
    return true
  },
})
