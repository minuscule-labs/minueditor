import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { describe, expect, it } from 'vitest'
import { markdownResourceAt, markdownResources } from './markdown-resources'

function markdownState(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown()] })
}

describe('parsed Markdown resources', () => {
  it('extracts canonical inline link ranges and destination', () => {
    const doc = 'Before [label](/internal/attachments/att_123/content) after'
    const state = markdownState(doc)

    expect(markdownResources(state)).toEqual([
      {
        kind: 'link',
        from: doc.indexOf('[label]'),
        to: doc.indexOf(' after'),
        labelFrom: doc.indexOf('label'),
        labelTo: doc.indexOf(']'),
        label: 'label',
        urlFrom: doc.indexOf('/internal'),
        urlTo: doc.indexOf(') after'),
        destinationFrom: doc.indexOf('/internal'),
        destinationTo: doc.indexOf(') after'),
        destination: '/internal/attachments/att_123/content',
      },
    ])
  })

  it('separates optional titles from balanced-parenthesis destinations', () => {
    const doc = '[diagram](https://example.com/a_(large).png "Diagram title")'
    const state = markdownState(doc)
    const resource = markdownResources(state)[0]

    expect(resource).toMatchObject({
      kind: 'link',
      label: 'diagram',
      destination: 'https://example.com/a_(large).png',
      title: { value: 'Diagram title' },
    })
    expect(state.sliceDoc(resource?.urlFrom, resource?.urlTo)).toBe(
      'https://example.com/a_(large).png',
    )
  })

  it('extracts image URLs without contaminating them with titles', () => {
    const doc = '![architecture](/images/architecture.png "Architecture")'
    const state = markdownState(doc)
    const resource = markdownResources(state)[0]

    expect(resource).toMatchObject({
      kind: 'image',
      label: 'architecture',
      destination: '/images/architecture.png',
      title: { value: 'Architecture' },
    })
  })

  it('removes angle-bracket destination syntax while preserving its source range', () => {
    const doc = '![diagram](<https://example.com/image with spaces.png>)'
    const state = markdownState(doc)
    const resource = markdownResources(state)[0]

    expect(resource).toMatchObject({
      kind: 'image',
      destination: 'https://example.com/image with spaces.png',
    })
    expect(state.sliceDoc(resource?.urlFrom, resource?.urlTo)).toBe(
      '<https://example.com/image with spaces.png>',
    )
    expect(state.sliceDoc(resource?.destinationFrom, resource?.destinationTo)).toBe(
      'https://example.com/image with spaces.png',
    )
  })

  it('unescapes Markdown punctuation in the parsed destination', () => {
    const state = markdownState('[escaped](https://example.com/a_\\(b\\).png)')

    expect(markdownResources(state)[0]?.destination).toBe(
      'https://example.com/a_(b).png',
    )
  })

  it('keeps authored label Markdown separate from the destination', () => {
    const state = markdownState('[**strong label**](https://example.com)')

    expect(markdownResources(state)[0]).toMatchObject({
      label: '**strong label**',
      destination: 'https://example.com',
    })
  })

  it('uses the destination URL when the visible label is also parsed as a URL', () => {
    const state = markdownState('[https://label.example](https://destination.example)')

    expect(markdownResources(state)[0]).toMatchObject({
      label: 'https://label.example',
      destination: 'https://destination.example',
    })
  })

  it('excludes reference-style links and autolinks from the live inline abstraction', () => {
    const state = markdownState([
      '[reference][id]',
      '',
      '<https://example.com/angle>',
      '',
      'https://example.com/bare',
      '',
      '[id]: /reference',
    ].join('\n'))

    expect(markdownResources(state)).toEqual([])
  })

  it('finds a resource at a position and filters by kind', () => {
    const doc = '![image](/image.png) and [link](/link)'
    const state = markdownState(doc)
    const imagePosition = doc.indexOf('image')
    const linkPosition = doc.indexOf('link')

    expect(markdownResourceAt(state, imagePosition)?.kind).toBe('image')
    expect(markdownResourceAt(state, linkPosition, 'link')?.destination).toBe('/link')
    expect(markdownResourceAt(state, imagePosition, 'link')).toBeNull()
  })

  it('limits collection to resources overlapping the requested range', () => {
    const doc = '[first](/first) and [second](/second)'
    const state = markdownState(doc)
    const secondFrom = doc.indexOf('[second]')

    expect(markdownResources(state, secondFrom, doc.length).map((resource) => resource.label)).toEqual([
      'second',
    ])
  })
})
