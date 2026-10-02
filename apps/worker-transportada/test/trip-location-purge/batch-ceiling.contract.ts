/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createTripLocationPurgeRoutine } from '../../src/trip-location-purge/application/trip-location-purge.routine.js'
import type { RedactTripLocations } from '../../src/trip-location-purge/application/trip-location.port.js'
import {
  TRIP_LOCATION_PURGE_BATCH_SIZE,
  TRIP_LOCATION_PURGE_MAX_BATCHES,
} from '../../src/trip-location-purge/domain/trip-location-purge.constant.js'
import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'

const NOW = new Date('2026-09-30T09:00:00.000Z')
const CYCLE_FINISHED_MESSAGE = 'trip_location_purge_cycle_finished'

/** Nome do redator na rotina -> tabela que ele varre. */
const TABLE_BY_REDACTOR = {
  redact: 'trip_stop_events',
  redactDocumentOccurrenceLocations: 'trip_document_occurrences',
  redactProofLocations: 'trip_delivery_proofs',
  redactStatusEventLocations: 'trip_status_events',
  redactStopOccurrenceLocations: 'trip_stop_occurrences',
} as const

type RedactorName = keyof typeof TABLE_BY_REDACTOR
type Redactors = Record<RedactorName, RedactTripLocations>

const REDACTOR_NAMES = Object.keys(TABLE_BY_REDACTOR) as RedactorName[]
const ALL_TABLES = Object.values(TABLE_BY_REDACTOR).sort()
const MAX_REDACTED_PER_TABLE = TRIP_LOCATION_PURGE_MAX_BATCHES * TRIP_LOCATION_PURGE_BATCH_SIZE

const CONTEXT: JobRoutineContext = {
  correlationId: 'batch-ceiling-contract',
  executionId: 'execution-1',
  isStopRequested: () => false,
  job: 'trip.location.purge',
  origin: 'schedule',
}

/** Redator que devolve a sequência dada e depois zero, contando as chamadas. */
function buildScriptedRedactor(
  batches: readonly number[],
  calls: { count: number },
): RedactTripLocations {
  return async () => {
    const redacted = batches[calls.count] ?? 0
    calls.count += 1
    return redacted
  }
}

function buildFullRedactor(calls: { count: number }): RedactTripLocations {
  return async () => {
    calls.count += 1
    return TRIP_LOCATION_PURGE_BATCH_SIZE
  }
}

async function runCycle(buildRedactor: (name: RedactorName) => RedactTripLocations) {
  const logs: { readonly message: string; readonly metadata: Record<string, unknown> }[] = []
  const redactors = Object.fromEntries(
    REDACTOR_NAMES.map((name) => [name, buildRedactor(name)]),
  ) as Redactors
  const dependencies = {
    logger: {
      error: () => undefined,
      info: (message: string, metadata?: Record<string, unknown>) => {
        logs.push({ message, metadata: metadata ?? {} })
      },
      warn: () => undefined,
    },
    now: () => NOW,
    purgeStalePings: async () => 0,
    ...redactors,
  }

  const result = await createTripLocationPurgeRoutine(dependencies).run(CONTEXT)
  const cycleLog = logs.find((entry) => entry.message === CYCLE_FINISHED_MESSAGE)

  return { metadata: cycleLog?.metadata, result }
}

/**
 * Spec 196 D8: o teto de lotes vale **por tabela**. Teto global faria a tabela atrasada comer o
 * ciclo das outras, e o prazo de noventa dias deixaria de valer justamente onde há mais atraso.
 */
describe('teto de lotes e exhausted por tabela (spec 196 D8)', () => {
  test('cada tabela roda até o próprio teto de lotes, nenhuma divide o do vizinho', async () => {
    const callsByRedactor = Object.fromEntries(
      REDACTOR_NAMES.map((name) => [name, { count: 0 }]),
    ) as Record<RedactorName, { count: number }>

    await runCycle((name) => buildFullRedactor(callsByRedactor[name]))

    for (const name of REDACTOR_NAMES) {
      expect(`${TABLE_BY_REDACTOR[name]}: ${callsByRedactor[name].count}`).toBe(
        `${TABLE_BY_REDACTOR[name]}: ${TRIP_LOCATION_PURGE_MAX_BATCHES}`,
      )
    }
  })

  test('o log diz quais tabelas bateram no teto e quanto cada uma apagou', async () => {
    const { metadata } = await runCycle(() => buildFullRedactor({ count: 0 }))

    expect([...((metadata?.exhaustedTables as string[] | undefined) ?? [])].sort()).toEqual(
      ALL_TABLES,
    )
    expect(metadata?.redactedByTable).toEqual(
      Object.fromEntries(ALL_TABLES.map((table) => [table, MAX_REDACTED_PER_TABLE])),
    )
  })

  test('a tabela atrasada não come o ciclo das outras: só ela é exhausted', async () => {
    const callsByRedactor = Object.fromEntries(
      REDACTOR_NAMES.map((name) => [name, { count: 0 }]),
    ) as Record<RedactorName, { count: number }>

    const { metadata } = await runCycle((name) =>
      name === 'redact'
        ? buildFullRedactor(callsByRedactor[name])
        : buildScriptedRedactor([3], callsByRedactor[name]),
    )

    expect(metadata?.exhaustedTables).toEqual(['trip_stop_events'])
    expect(metadata?.redactedByTable).toEqual({
      trip_delivery_proofs: 3,
      trip_document_occurrences: 3,
      trip_status_events: 3,
      trip_stop_events: MAX_REDACTED_PER_TABLE,
      trip_stop_occurrences: 3,
    })
    for (const name of REDACTOR_NAMES.filter((candidate) => candidate !== 'redact')) {
      expect(`${TABLE_BY_REDACTOR[name]}: ${callsByRedactor[name].count}`).toBe(
        `${TABLE_BY_REDACTOR[name]}: 2`,
      )
    }
  })

  test('base sem posição vencida: nenhuma tabela exhausted e as cinco aparecem zeradas', async () => {
    const { metadata } = await runCycle(() => async () => 0)

    expect(metadata?.exhaustedTables).toEqual([])
    expect(metadata?.redactedByTable).toEqual(
      Object.fromEntries(ALL_TABLES.map((table) => [table, 0])),
    )
  })
})
