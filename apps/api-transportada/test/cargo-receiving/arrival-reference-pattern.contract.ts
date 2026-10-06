/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 T1.3 (ADR-0094 §2): o padrão que lê o `NroCarga` vai rodar sobre texto de NF-e de
 * terceiro. Na gravação ele nunca é executado — só recusado quando faria o motor retroceder sem
 * limite, ou quando não devolveria exatamente um valor.
 */
import { describe, expect, test } from 'bun:test'

import {
  type ArrivalReferencePatternIssue,
  findArrivalReferencePatternIssue,
} from '../../src/cargo-receiving/domain/arrival-reference-pattern.policy.js'

describe('o padrão de leitura da carga (spec 237 T1.3)', () => {
  test.each([
    ['NroCarga\\s*[:=]?\\s*(\\d+)'],
    ['NroCarga:\\s*(?<cargo>[A-Z0-9-]+)'],
    ['(\\d{6})'],
    ['Carga (\\p{L}+)'],
    ['(?:NroCarga|Carga):\\s*(\\d+)'],
    ['LACRE\\s*[(]?(\\d+)'],
  ])('aceita %p', (pattern) => {
    expect(findArrivalReferencePatternIssue(pattern)).toBeUndefined()
  })

  test.each<[string, ArrivalReferencePatternIssue]>([
    ['(\\d+', 'invalid_syntax'],
    ['a{2', 'invalid_syntax'],
    ['(a+)+', 'nested_quantifier'],
    ['(a*)*', 'nested_quantifier'],
    ['(a?)+', 'nested_quantifier'],
    ['([a-z]+){2,}', 'nested_quantifier'],
    ['(?:\\d+)+(x)', 'nested_quantifier'],
    ['((?:\\s*\\d)+)', 'nested_quantifier'],
    ['(a|ab)+', 'quantified_alternation'],
    ['(?:a|b)*(\\d)', 'quantified_alternation'],
    ['(\\d)\\1', 'backreference'],
    ['(?<cargo>\\d)\\k<cargo>', 'backreference'],
    ['NroCarga(?=:)(\\d+)', 'lookaround'],
    ['(?<=Carga)(\\d+)', 'lookaround'],
    ['(?!x)(\\d)', 'lookaround'],
    ['(?<!x)(\\d)', 'lookaround'],
    ['NroCarga', 'capture_group_count'],
    ['((\\d+))', 'capture_group_count'],
    ['(a)(b)', 'capture_group_count'],
  ])('recusa %p como %p', (pattern, issue) => {
    expect(findArrivalReferencePatternIssue(pattern)).toBe(issue)
  })

  /** Classe e escape não abrem grupo nem quantificam: `[(+]` e `\(` são literais. */
  test('parênteses e quantificadores literais não contam', () => {
    expect(findArrivalReferencePatternIssue('[(+)]*\\(x\\)+(\\d)')).toBeUndefined()
  })
})
