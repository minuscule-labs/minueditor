import { HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'

/**
 * Default active fenced-code highlight style.
 *
 * The palette intentionally mirrors Shiki's `github-dark` colors so active
 * CodeMirror code-block editing and inactive/rendered Shiki blocks feel like
 * the same theme.
 */
export const githubDarkCodeHighlightStyle = HighlightStyle.define([
  { tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment, tags.meta], color: '#8b949e' },
  { tag: [tags.keyword, tags.controlKeyword, tags.definitionKeyword, tags.moduleKeyword, tags.operatorKeyword], color: '#ff7b72' },
  { tag: [tags.string, tags.docString, tags.character, tags.attributeValue], color: '#a5d6ff' },
  { tag: [tags.number, tags.integer, tags.float, tags.bool, tags.null, tags.atom, tags.literal], color: '#79c0ff' },
  { tag: [tags.propertyName, tags.attributeName, tags.typeName, tags.className], color: '#79c0ff' },
  { tag: [tags.definition(tags.variableName), tags.function(tags.variableName), tags.function(tags.propertyName), tags.labelName], color: '#d2a8ff' },
  { tag: [tags.variableName, tags.name], color: '#c9d1d9' },
  { tag: [tags.operator, tags.derefOperator, tags.arithmeticOperator, tags.logicOperator, tags.bitwiseOperator, tags.compareOperator, tags.updateOperator, tags.definitionOperator, tags.typeOperator, tags.controlOperator], color: '#ff7b72' },
  { tag: [tags.punctuation, tags.separator, tags.bracket, tags.angleBracket, tags.squareBracket, tags.paren, tags.brace], color: '#c9d1d9' },
  { tag: [tags.regexp, tags.escape, tags.special(tags.string)], color: '#a5d6ff' },
  { tag: tags.invalid, color: '#f85149' },
])
