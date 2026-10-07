/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import {
  tripDeliveryProofs,
  tripDocumentOccurrences,
  tripStatusEvents,
  tripStopEvents,
  tripStopOccurrences,
} from '../../src/database/trip-execution.schema.js'
import { buildLocatedEventRedactionStatement } from '../../src/trip-location-purge/infrastructure/drizzle-trip-location.repository.js'

const NOW = new Date('2026-09-30T09:00:00.000Z')

function render(input: {
  readonly clearsCapturedAt: boolean
  readonly table: Parameters<typeof buildLocatedEventRedactionStatement>[0]['table']
  readonly timeColumn: AnyPgColumn
}) {
  return new PgDialect().sqlToQuery(
    buildLocatedEventRedactionStatement({ ...input, limit: 500, now: NOW }),
  )
}

/**
 * Spec 239 D2: o formato do comando é decisão de segurança (isolamento de tenant e trava). O banco prova o
 * comportamento; este contrato prova o que o banco de teste pequeno não alcança.
 */
describe('formato do UPDATE do expurgo por empresa (spec 239 D2)', () => {
  const events = render({
    clearsCapturedAt: true,
    table: tripStopEvents,
    timeColumn: tripStopEvents.createdAt,
  })

  test('junta por empresa com LATERAL e compara com o prazo da própria empresa', () => {
    expect(events.sql).toContain('cross join lateral')
    expect(events.sql).toContain('x."company_id" = s."company_id"')
    expect(events.sql).toContain('make_interval(days => s."retention_days")')
  })

  test('o relógio entra com cast timestamptz nos dois pontos', () => {
    expect(events.sql.match(/::timestamptz/g)).toHaveLength(2)
    expect(events.params.filter((value) => value === NOW.toISOString())).toHaveLength(2)
  })

  /** `FOR UPDATE` sem `OF x` trava a linha de configuração e o `PUT` da tela esperaria o lote. */
  test('não trava linha: nada de FOR UPDATE nem SKIP LOCKED', () => {
    expect(events.sql.toLowerCase()).not.toContain('for update')
    expect(events.sql.toLowerCase()).not.toContain('skip locked')
  })

  test('o estado vira expired e o filtro de ponto se repete fora da subconsulta', () => {
    expect(events.params).toContain('expired')
    expect(events.sql.match(/"latitude" is not null/g)).toHaveLength(2)
  })

  test('o comprovante guarda captured_at; as tabelas de evento o apagam', () => {
    const proof = render({
      clearsCapturedAt: false,
      table: tripDeliveryProofs,
      timeColumn: tripDeliveryProofs.createdAt,
    })

    expect(proof.sql).not.toContain('"captured_at"')
    expect(events.sql).toContain('"captured_at" = null')
  })

  test('cada tabela usa a própria coluna de tempo', () => {
    const times = [
      [tripStatusEvents, tripStatusEvents.recordedAt, '"recorded_at"'],
      [tripStopOccurrences, tripStopOccurrences.createdAt, '"created_at"'],
      [tripDocumentOccurrences, tripDocumentOccurrences.createdAt, '"created_at"'],
    ] as const

    for (const [table, timeColumn, column] of times) {
      const query = new PgDialect().sqlToQuery(
        buildLocatedEventRedactionStatement({
          clearsCapturedAt: true,
          limit: 500,
          now: NOW,
          table,
          timeColumn,
        }),
      )
      expect(query.sql).toContain(`x.${column} < `)
      expect(query.sql).toContain(`order by x.${column}`)
    }
  })
})
