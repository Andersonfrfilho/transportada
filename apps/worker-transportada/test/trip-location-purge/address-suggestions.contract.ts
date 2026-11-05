/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 294 S4 (LGPD): a sugestão de endereço guarda o ponto do motorista e quem a criou. Ela sai em 90 dias — da
 * decisão, ou da criação enquanto pendente — no mesmo ciclo do expurgo da coordenada, ligado ou não o expurgo da empresa.
 */
import { describe, expect, test } from 'bun:test'
import { PgDialect } from 'drizzle-orm/pg-core'

import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'
import { createTripLocationPurgeRoutine } from '../../src/trip-location-purge/application/trip-location-purge.routine.js'
import {
  ADDRESS_CORRECTION_SUGGESTIONS_TABLE,
  ADDRESS_CORRECTION_SUGGESTION_MAX_AGE_DAYS,
  resolveAddressSuggestionPurgeCutoff,
  TRIP_LOCATION_PURGE_BATCH_SIZE,
  TRIP_LOCATION_UNSTAMPED_TABLES,
} from '../../src/trip-location-purge/domain/trip-location-purge.constant.js'
import { buildAddressSuggestionPurgeStatement } from '../../src/trip-location-purge/infrastructure/drizzle-trip-location.repository.js'

const NOW = new Date('2026-11-05T09:00:00.000Z')

const CONTEXT: JobRoutineContext = {
  correlationId: 'address-suggestions-contract',
  executionId: 'execution-1',
  isStopRequested: () => false,
  job: 'trip.location.purge',
  origin: 'schedule',
}

function buildRoutine(input: {
  readonly countEligibleCompanies?: () => Promise<number>
  readonly purgeAddressSuggestions: (params: {
    readonly before: Date
    readonly limit: number
  }) => Promise<number>
}) {
  return createTripLocationPurgeRoutine({
    countEligibleCompanies: input.countEligibleCompanies ?? (async () => 1),
    logger: { error() {}, info() {}, warn() {} } as never,
    now: () => NOW,
    purgeAddressSuggestions: input.purgeAddressSuggestions,
    purgeStalePings: async () => 0,
    redact: async () => 0,
    redactDocumentOccurrenceLocations: async () => 0,
    redactProofLocations: async () => 0,
    redactStatusEventLocations: async () => 0,
    redactStopOccurrenceLocations: async () => 0,
  })
}

describe('expurgo da sugestão de endereço (spec 294 S4)', () => {
  test('o prazo é de 90 dias', () => {
    expect(ADDRESS_CORRECTION_SUGGESTION_MAX_AGE_DAYS).toBe(90)
    expect(resolveAddressSuggestionPurgeCutoff(NOW)).toEqual(
      new Date(NOW.getTime() - 90 * 86_400_000),
    )
  })

  test('apaga em lotes até não sobrar sugestão vencida, com o corte de 90 dias', async () => {
    const asked: { readonly before: Date; readonly limit: number }[] = []
    const remaining = [TRIP_LOCATION_PURGE_BATCH_SIZE, 3, 0]
    await buildRoutine({
      purgeAddressSuggestions: async (params) => {
        asked.push(params)
        return remaining[asked.length - 1] ?? 0
      },
    }).run(CONTEXT)

    expect(asked).toHaveLength(3)
    expect(asked[0]).toEqual({
      before: resolveAddressSuggestionPurgeCutoff(NOW),
      limit: TRIP_LOCATION_PURGE_BATCH_SIZE,
    })
  })

  test('roda mesmo com o expurgo da empresa desligado: o prazo é do produto, não da tela', async () => {
    let calls = 0
    const result = await buildRoutine({
      countEligibleCompanies: async () => 0,
      purgeAddressSuggestions: async () => {
        calls += 1
        return 0
      },
    }).run(CONTEXT)

    expect(result.outcome).toBe('succeeded')
    expect(calls).toBe(1)
  })

  test('a sentença apaga a linha inteira: pendente pela criação, decidida pela decisão', () => {
    const text = new PgDialect()
      .sqlToQuery(buildAddressSuggestionPurgeStatement({ before: NOW, limit: 10 }))
      .sql.replace(/\s+/gu, ' ')
    expect(text).toContain(`delete from "${ADDRESS_CORRECTION_SUGGESTIONS_TABLE}"`)
    expect(text).toContain(`status = 'pending' and created_at <`)
    expect(text).toContain(`status <> 'pending' and decided_at <`)
  })

  test('a tabela segue fora do expurgo por empresa, com o motivo do prazo próprio', () => {
    const entry = TRIP_LOCATION_UNSTAMPED_TABLES.find(
      (item) => item.table === ADDRESS_CORRECTION_SUGGESTIONS_TABLE,
    )
    expect(entry?.reason).toContain('90 dias')
  })
})
