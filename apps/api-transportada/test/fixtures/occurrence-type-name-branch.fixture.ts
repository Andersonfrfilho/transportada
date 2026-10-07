/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 T4.5 (CA03): o detector do teste de parede. Acha, no código (comentário fora), o que faz uma
 * regra seguir o NOME do tipo de ocorrência ou o contratante de uma transportadora específica, em vez da
 * configuração: comparação do nome com literal, `switch` sobre o nome, e literal que é nome de tipo do
 * catálogo ou palavra de domínio de um cliente.
 *
 * ⚠️ O detector é função pura para que o teste prove que ele **acha** a violação — um teste de parede
 * que só lê a fonte passa verde com a regra arrancada, e um detector que nunca acha nada também.
 */
import {
  OCCURRENCE_TYPE_CATALOG,
  RECEIVING_OCCURRENCE_TYPE_CATALOG,
} from '../../src/shared/occurrence-type-catalog.constant.js'
import { TRIP_OCCURRENCE_TYPES } from '../../src/shared/trip-occurrence.constant.js'

const NAME_PROPERTIES = String.raw`(?:\.name\b|\btypeName\b|\boccurrenceTypeName\b)`
const NON_EMPTY_LITERAL = String.raw`(['"\x60])(?!\1)`

const NAME_AGAINST_LITERAL = new RegExp(
  String.raw`${NAME_PROPERTIES}\s*[!=]==?\s*${NON_EMPTY_LITERAL}`,
  'u',
)
const LITERAL_AGAINST_NAME = new RegExp(
  String.raw`(['"\x60])[^'"\x60\n]+\1\s*[!=]==?\s*[\w.?]*${NAME_PROPERTIES}`,
  'u',
)
const SWITCH_ON_NAME = new RegExp(String.raw`switch\s*\([^)]*${NAME_PROPERTIES}\s*\)`, 'u')
const CONTRACTOR_WORD = /spani/iu
const DOMAIN_WORD = String.raw`(?:devolu[cç][aã]o|prorroga[cç][aã]o)`
/** A palavra do cliente como condição: operando de comparação, `case`, `includes`/`test`/`match`. */
const DOMAIN_WORD_CONDITION = new RegExp(
  String.raw`(?:[!=]==?\s*|\bcase\s+|\.(?:includes|startsWith|endsWith|test|match)\(\s*)[/'"\x60][^'"\x60/\n]*${DOMAIN_WORD}` +
    String.raw`|[/'"\x60][^'"\x60/\n]*${DOMAIN_WORD}[^'"\x60/\n]*[/'"\x60]\s*[!=]==?` +
    String.raw`|\/[^/\n]*${DOMAIN_WORD}[^/\n]*\/[a-z]*\.test\(`,
  'iu',
)
const TYPEOF_EXPRESSION = /\btypeof\s+[\w.?[\]]+/gu
const STRING_LITERAL = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/gu

export const OCCURRENCE_TYPE_NAME_VIOLATION = {
  clientDomainWord: 'client-domain-word',
  catalogLiteral: 'catalog-literal',
  nameComparison: 'name-comparison',
  nameSwitch: 'name-switch',
} as const

export type OccurrenceTypeNameViolation =
  (typeof OCCURRENCE_TYPE_NAME_VIOLATION)[keyof typeof OCCURRENCE_TYPE_NAME_VIOLATION]

/** Os nomes de tipo que o produto semeia e as chaves de `trip_document_occurrences.type`. */
export const OCCURRENCE_TYPE_CATALOG_LITERALS: ReadonlySet<string> = new Set([
  ...OCCURRENCE_TYPE_CATALOG.map((entry) => entry.name),
  ...RECEIVING_OCCURRENCE_TYPE_CATALOG.map((entry) => entry.name),
  ...TRIP_OCCURRENCE_TYPES.map((entry) => entry.type),
])

/** Tira os comentários de linha e de bloco sem tocar no que está entre aspas. */
export function stripComments(source: string): string {
  let output = ''
  let index = 0
  let quote: null | string = null
  while (index < source.length) {
    const char = source.charAt(index)
    const next = source.charAt(index + 1)
    if (quote !== null) {
      output += char
      if (char === '\\') {
        output += next
        index += 2
        continue
      }
      if (char === quote) quote = null
      index += 1
      continue
    }
    if (char === '/' && next === '/') {
      while (index < source.length && source.charAt(index) !== '\n') index += 1
      continue
    }
    if (char === '/' && next === '*') {
      const end = source.indexOf('*/', index + 2)
      index = end === -1 ? source.length : end + 2
      continue
    }
    if (char === '"' || char === "'" || char === '`') quote = char
    output += char
    index += 1
  }
  return output
}

export function findOccurrenceTypeNameViolations(
  source: string,
): readonly OccurrenceTypeNameViolation[] {
  const code = stripComments(source).replace(TYPEOF_EXPRESSION, 'typeof_check')
  const violations: OccurrenceTypeNameViolation[] = []
  if (NAME_AGAINST_LITERAL.test(code) || LITERAL_AGAINST_NAME.test(code)) {
    violations.push(OCCURRENCE_TYPE_NAME_VIOLATION.nameComparison)
  }
  if (SWITCH_ON_NAME.test(code)) violations.push(OCCURRENCE_TYPE_NAME_VIOLATION.nameSwitch)
  if (CONTRACTOR_WORD.test(code) || DOMAIN_WORD_CONDITION.test(code)) {
    violations.push(OCCURRENCE_TYPE_NAME_VIOLATION.clientDomainWord)
  }
  const literals = [...code.matchAll(STRING_LITERAL)].map((match) => match[2] ?? '')
  if (literals.some((literal) => OCCURRENCE_TYPE_CATALOG_LITERALS.has(literal))) {
    violations.push(OCCURRENCE_TYPE_NAME_VIOLATION.catalogLiteral)
  }
  return violations
}
