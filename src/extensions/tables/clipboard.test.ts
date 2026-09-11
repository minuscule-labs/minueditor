import { describe, expect, it } from 'vitest'
import { parseTableClipboard } from './clipboard'

describe('table clipboard parsing', () => {
  it('parses rectangular TSV including quoted tabs and escaped quotes', () => {
    expect(parseTableClipboard('Name\tNotes\nAda\t"one\ttwo"\nGrace\t"say ""hi"""')).toEqual({
      status: 'valid',
      cells: [
        ['Name', 'Notes'],
        ['Ada', 'one\ttwo'],
        ['Grace', 'say "hi"'],
      ],
    })
  })

  it('rejects malformed, ragged, and multiline tabular input without flattening cells', () => {
    expect(parseTableClipboard('A\t"unterminated')).toEqual({ status: 'invalid' })
    expect(parseTableClipboard('A\tB\n1')).toEqual({ status: 'invalid' })
    expect(parseTableClipboard('A\t"line one\nline two"')).toEqual({ status: 'multiline-cell' })
  })

  it('rejects clipboard input over the central byte limit before parsing', () => {
    expect(parseTableClipboard(`${'x'.repeat(1_048_576)}\tvalue`)).toEqual({ status: 'oversize' })
  })

  it('leaves ordinary input to the native cell editor', () => {
    expect(parseTableClipboard('ordinary text')).toEqual({ status: 'not-tabular' })
    expect(parseTableClipboard('')).toEqual({ status: 'empty' })
  })
})
