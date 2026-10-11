import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { expandInlineMarkdownRange } from './inline-markdown'

function state(doc: string) {
  return EditorState.create({ doc, extensions: [markdown({ base: markdownLanguage })] })
}

function copied(doc: string, from: number, to: number) {
  const editorState = state(doc)
  const expanded = expandInlineMarkdownRange(editorState, { from, to })
  return editorState.sliceDoc(expanded.from, expanded.to)
}

describe('formatted selection boundaries', () => {
  it.each([
    ['**bold**', 1, 6],
    ['**bold**', 2, 7],
    ['__bold__', 1, 7],
    ['__bold__', 2, 6],
    ['*italic*', 1, 7],
    ['_italic_', 1, 7],
    ['~~strike~~', 1, 9],
    ['`code`', 1, 5],
    ['``a ` b``', 2, 8],
    ['***bold italic***', 3, 15],
    ['**outer *inner* rest**', 9, 14],
    ['**multi\nline**', 3, 11],
  ])('restores complete syntax around a selection in %s', (doc, from, to) => {
    expect(copied(doc, from, to)).toBe(doc)
  })

  it('repairs an opening-marker endpoint in a multiline snippet', () => {
    const doc = '**bold** starts here.\nContinue below.'
    expect(copied(doc, 1, doc.length)).toBe(doc)
  })

  it('repairs selections that begin in closing markers or end in opening markers', () => {
    const doc = 'Before **bold** after'
    expect(copied(doc, 14, doc.length)).toBe('**bold** after')
    expect(copied(doc, 0, 8)).toBe('Before **bold**')
  })

  it('parses distant formatting before expanding a selection in a long note', () => {
    const prefix = 'Ordinary paragraph.\n\n'.repeat(500)
    const doc = prefix + '__distant bold__'
    expect(copied(doc, prefix.length + 1, doc.length - 1)).toBe('__distant bold__')
  })

  it('retains the existing whole-span behavior for partial formatted content', () => {
    expect(copied('Before **several words** after', 12, 15)).toBe('**several words**')
  })

  it('keeps the enclosing code syntax rather than interpreting its literal stars', () => {
    const doc = '``prefix **literal** ` suffix``'
    const from = doc.indexOf('literal')
    expect(copied(doc, from, from + 'literal'.length)).toBe(doc)
  })

  it.each([
    '```md\n**literal**\n```',
    '    **literal**',
    '\\*\\*literal\\*\\*',
  ])('does not expand literal or escaped Markdown in %s', (doc) => {
    const from = doc.indexOf('literal')
    expect(copied(doc, from, from + 'literal'.length)).toBe('literal')
  })

  it('does not include adjacent formatting when only ordinary text is selected', () => {
    const doc = '**before** ordinary **after**'
    const from = doc.indexOf(' ordinary ')
    expect(copied(doc, from, from + ' ordinary '.length)).toBe(' ordinary ')
  })

  it('leaves collapsed selections unchanged', () => {
    expect(expandInlineMarkdownRange(state('**bold**'), { from: 1, to: 1 })).toEqual({ from: 1, to: 1 })
  })

  it('preserves inline links around selected labels without expanding selected URL text', () => {
    const doc = '[**label**](/path "Title")'
    expect(copied(doc, doc.indexOf('label'), doc.indexOf('label') + 5)).toBe(doc)
    const from = doc.indexOf('/path')
    expect(copied(doc, from, from + 5)).toBe('/path')
  })
})
