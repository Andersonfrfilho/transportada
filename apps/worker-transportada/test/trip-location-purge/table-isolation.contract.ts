/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'
import { createTripLocationPurgeRoutine } from '../../src/trip-location-purge/application/trip-location-purge.routine.js'
import type { RedactTripLocations } from '../../src/trip-location-purge/application/trip-location.port.js'

const NOW = new Date('2026-09-30T09:00:00.000Z')
const MISSING_COLUMN_SQLSTATE = '42703'
const SECRET_COORDINATE = '-23.5505199'

const CONTEXT: JobRoutineContext = {
  correlationId: 'table-isolation-contract',
  executionId: 'execution-1',
  isStopRequested: () => false,
  job: 'trip.location.purge',
  origin: 'schedule',
}

type LoggedEntry = { readonly message: string; readonly metadata: Record<string, unknown> }

/** Erro no formato do driver: o SQLSTATE vem em `cause`, e a mensagem cita a linha com a coordenada. */
function buildMissingColumnError(): Error {
  return new Error(`Failed query: update ... Failing row contains (${SECRET_COORDINATE})`, {
    cause: { code: MISSING_COLUMN_SQLSTATE },
  })
}

function buildRoutineWithFailingStatusEvents() {
  const logs: { error: LoggedEntry[]; info: LoggedEntry[] } = { error: [], info: [] }
  const callsByTable = { documentOccurrences: 0, proofs: 0, stopEvents: 0, stopOccurrences: 0 }
  const redactOnce =
    (key: keyof typeof callsByTable, amount: number): RedactTripLocations =>
    async () => {
      callsByTable[key] += 1
      return callsByTable[key] === 1 ? amount : 0
    }

  const routine = createTripLocationPurgeRoutine({
    countEligibleCompanies: async () => 1,
    logger: {
      error: (message, metadata) => logs.error.push({ message, metadata: metadata ?? {} }),
      info: (message, metadata) => logs.info.push({ message, metadata: metadata ?? {} }),
      warn: () => undefined,
    },
    now: () => NOW,
    purgeStalePings: async () => 0,
    redact: redactOnce('stopEvents', 4),
    redactDocumentOccurrenceLocations: redactOnce('documentOccurrences', 2),
    redactProofLocations: redactOnce('proofs', 3),
    redactStatusEventLocations: async () => {
      throw buildMissingColumnError()
    },
    redactStopOccurrenceLocations: redactOnce('stopOccurrences', 1),
  })

  return { callsByTable, logs, routine }
}

/**
 * Spec 196 D8: a API migra antes do worker subir, mas a ordem de deploy não é garantia. Se a coluna
 * nova ainda não existe (42703), a tabela falha — e as outras quatro seguem cumprindo o prazo.
 */
describe('isolamento de erro por tabela do expurgo (spec 196 D8)', () => {
  test('uma tabela que falha não impede as outras e o ciclo termina em sucesso', async () => {
    const { callsByTable, routine } = buildRoutineWithFailingStatusEvents()

    const result = await routine.run(CONTEXT)

    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toEqual({ batches: 1, purgedPings: 0, redacted: 4, redactedProofs: 3 })
    expect(callsByTable).toEqual({
      documentOccurrences: 2,
      proofs: 2,
      stopEvents: 2,
      stopOccurrences: 2,
    })
  })

  test('o log do ciclo diz qual tabela falhou e quanto cada uma das outras apagou', async () => {
    const { logs, routine } = buildRoutineWithFailingStatusEvents()

    await routine.run(CONTEXT)

    const cycle = logs.info.find((entry) => entry.message === 'trip_location_purge_cycle_finished')
    expect(cycle?.metadata.failedTables).toEqual(['trip_status_events'])
    expect(cycle?.metadata.redactedByTable).toEqual({
      trip_delivery_proofs: 3,
      trip_document_occurrences: 2,
      trip_status_events: 0,
      trip_stop_events: 4,
      trip_stop_occurrences: 1,
    })
  })

  test('o log de erro leva a tabela e o SQLSTATE, nunca a mensagem do banco', async () => {
    const { logs, routine } = buildRoutineWithFailingStatusEvents()

    await routine.run(CONTEXT)

    expect(logs.error).toHaveLength(1)
    expect(logs.error[0]?.metadata.table).toBe('trip_status_events')
    expect(logs.error[0]?.metadata.sqlState).toBe(MISSING_COLUMN_SQLSTATE)
    expect(JSON.stringify([...logs.error, ...logs.info])).not.toContain(SECRET_COORDINATE)
  })
})
