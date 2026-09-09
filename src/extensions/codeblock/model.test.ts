import { EditorState } from '@codemirror/state'
import { markdown } from '@codemirror/lang-markdown'
import { describe, expect, it } from 'vitest'
import { getFencedBlockInfo } from './model'

function stateFor(doc: string): EditorState {
  return EditorState.create({ doc, extensions: [markdown()] })
}

describe('getFencedBlockInfo', () => {
  it('preserves every line of an unclosed fence through EOF', () => {
    const state = stateFor('```javascript\nfirst\nlast')

    expect(getFencedBlockInfo(state, 0)).toMatchObject({
      hasClosingFence: false,
      closingFenceFrom: null,
      code: 'first\nlast',
      lang: 'javascript',
    })
  })

  it('parses long tilde fences and their info string', () => {
    const state = stateFor('~~~~ python extra\nprint(1)\n~~~~')

    expect(getFencedBlockInfo(state, 0)).toMatchObject({
      hasClosingFence: true,
      code: 'print(1)',
      lang: 'python',
      fenceDelimiter: '~~~~',
      indent: '',
    })
  })

  it('does not treat a shorter or different delimiter as a closing fence', () => {
    const state = stateFor('````\nfirst\n```\nlast')

    expect(getFencedBlockInfo(state, 0)).toMatchObject({
      hasClosingFence: false,
      code: 'first\n```\nlast',
    })
  })

  it('tracks the exact language span without consuming indentation or info suffix', () => {
    const state = stateFor('  ```python extra\ncode\n  ```')

    expect(getFencedBlockInfo(state, 2)).toMatchObject({
      hasClosingFence: true,
      containerPrefix: '',
      indent: '  ',
      lang: 'python',
      languageFrom: 5,
      languageTo: 11,
    })
  })

  it('parses a list-contained fence without consuming the list marker', () => {
    const state = stateFor('- ```js\n  code\n  ```')

    expect(getFencedBlockInfo(state, 2)).toMatchObject({
      blockFrom: 2,
      hasClosingFence: true,
      fenceDelimiter: '```',
      containerPrefix: '- ',
      indent: '  ',
    })
  })

  it('returns empty content for an empty closed fence', () => {
    const state = stateFor('```\n```')

    expect(getFencedBlockInfo(state, 0)).toMatchObject({
      hasClosingFence: true,
      code: '',
    })
  })
})
