/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A listagem de ocorrências junta sete tabelas, e cada degrau tem de carregar o tenant: uma junção
 * por id solto é o caminho pelo qual a ocorrência de uma empresa aparece na tela de outra. O
 * contrato lê a fonte — uma assinatura que aceitasse junção simples compilaria e passaria em todo
 * teste de caminho feliz.
 */
import { describe, expect, test } from 'bun:test'

import { readFileSync } from 'node:fs'

const QUERY_SOURCE = readFileSync(
  new URL('../../src/trips/infrastructure/trip-occurrence-feed.query.ts', import.meta.url),
  'utf8',
)

describe('tenant safety da listagem de ocorrências', () => {
  test('as duas consultas ancoram a empresa no where', () => {
    expect(QUERY_SOURCE).toContain('eq(tripDocumentOccurrences.companyId, query.companyId)')
    expect(QUERY_SOURCE).toContain('eq(tripStopOccurrences.companyId, query.companyId)')
  })

  test('cada junção carrega o companyId — nunca só o id', () => {
    const joins = QUERY_SOURCE.match(/\.(?:inner|left)Join\(/gu) ?? []
    const scopedJoins =
      QUERY_SOURCE.match(/\.(?:inner|left)Join\(\s*\w+,\s*and\(\s*eq\(\w+\.companyId,/gu) ?? []
    expect(joins.length).toBeGreaterThan(0)
    expect(scopedJoins.length).toBe(joins.length)
  })

  test('a leitura de anexo exige empresa e ocorrência juntas', () => {
    expect(QUERY_SOURCE).toContain('eq(tripStopOccurrences.companyId, input.companyId)')
    expect(QUERY_SOURCE).toContain('eq(tripStopOccurrences.id, input.occurrenceId)')
    expect(QUERY_SOURCE).toContain('eq(storedObjects.companyId, tripStopOccurrences.companyId)')
  })
})
