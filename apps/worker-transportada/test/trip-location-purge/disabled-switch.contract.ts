/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 196: o expurgo nasce **desligado**, por decisão de produto — o controle vai virar página de
 * configuração. Desligado tem de significar "não leu, não contou, não apagou": uma rotina que só
 * deixa de achar linha venceria este contrato sem estar desligada, e apagar coordenada é
 * irreversível.
 */
import { describe, expect, test } from 'bun:test'

import { createTripLocationPurgeRoutine } from '../../src/trip-location-purge/application/trip-location-purge.routine.js'
import { parseWorkerEnvironment } from '../../src/config/environment.schema.js'

const CONTEXT = {
  correlationId: 'disabled-switch-contract',
  executionId: 'execution-1',
  isStopRequested: () => false,
  job: 'trip.location.purge' as const,
  origin: 'schedule' as const,
}

const DISABLED_MESSAGE = 'trip_location_purge_disabled'
const CYCLE_FINISHED_MESSAGE = 'trip_location_purge_cycle_finished'

type Call = { readonly message: string; readonly metadata: Record<string, unknown> }

/** O mínimo que o boot aceita, no molde de `test/environment.contract.test.ts`. */
const MINIMAL_ENVIRONMENT = {
  APP_ENV: 'local',
  DATABASE_URL: 'postgresql://transportada:transportada@localhost:55432/transportada',
  LOG_LEVEL: 'info',
  QUEUE_PREFIX: 'transportada_local',
  RABBITMQ_URL: 'amqp://transportada:transportada@localhost:55672',
  WORKER_PORT: '53002',
}

function buildRoutine(enabled: boolean) {
  const logs: Call[] = []
  const calls: string[] = []
  const countingRedactor = (name: string) => {
    let isFirstCall = true
    return async () => {
      calls.push(name)
      if (!isFirstCall) return 0
      isFirstCall = false
      return 1
    }
  }

  const routine = createTripLocationPurgeRoutine({
    enabled,
    logger: {
      error: () => undefined,
      info: (message: string, metadata?: Record<string, unknown>) => {
        logs.push({ message, metadata: metadata ?? {} })
      },
      warn: () => undefined,
    },
    now: () => new Date('2026-09-30T09:00:00.000Z'),
    purgeStalePings: countingRedactor('purgeStalePings'),
    redact: countingRedactor('redact'),
    redactDocumentOccurrenceLocations: countingRedactor('redactDocumentOccurrenceLocations'),
    redactProofLocations: countingRedactor('redactProofLocations'),
    redactStatusEventLocations: countingRedactor('redactStatusEventLocations'),
    redactStopOccurrenceLocations: countingRedactor('redactStopOccurrenceLocations'),
  })

  return { calls, logs, routine }
}

describe('o expurgo de posição nasce desligado (spec 196)', () => {
  test('desligado: nenhum redator das cinco tabelas é chamado; só o rastro ao vivo segue', async () => {
    const { calls, routine } = buildRoutine(false)

    await routine.run(CONTEXT)

    expect([...new Set(calls)]).toEqual(['purgeStalePings'])
  })

  test('desligado: o ciclo fecha succeeded, sem redigir tabela de evento, e conta os pings expurgados', async () => {
    const { routine } = buildRoutine(false)

    const result = await routine.run(CONTEXT)

    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toEqual({
      batches: 0,
      purgedPings: 1,
      redacted: 0,
      redactedProofs: 0,
    })
  })

  test('desligado: o log diz que foi de propósito, e não finge ciclo cumprido', async () => {
    const { logs, routine } = buildRoutine(false)

    await routine.run(CONTEXT)

    expect(logs.map((entry) => entry.message)).toEqual([DISABLED_MESSAGE])
  })

  test('ligado: os cinco redatores e o rastro ao vivo rodam, e o log é o do ciclo', async () => {
    const { calls, logs, routine } = buildRoutine(true)

    await routine.run(CONTEXT)

    expect([...new Set(calls)].toSorted()).toEqual([
      'purgeStalePings',
      'redact',
      'redactDocumentOccurrenceLocations',
      'redactProofLocations',
      'redactStatusEventLocations',
      'redactStopOccurrenceLocations',
    ])
    expect(logs.map((entry) => entry.message)).toContain(CYCLE_FINISHED_MESSAGE)
    expect(logs.map((entry) => entry.message)).not.toContain(DISABLED_MESSAGE)
  })

  /** Variável ausente tem de significar desligado: deploy que esquece a chave não pode apagar nada. */
  test('sem a variável no ambiente, o expurgo fica desligado', () => {
    const withoutTheKey = parseWorkerEnvironment(MINIMAL_ENVIRONMENT)

    expect(withoutTheKey.tripLocationPurgeEnabled).toBeFalse()
  })

  test('só `true` liga; qualquer outro valor derruba o boot em vez de adivinhar', () => {
    expect(
      parseWorkerEnvironment({ ...MINIMAL_ENVIRONMENT, TRIP_LOCATION_PURGE_ENABLED: 'true' })
        .tripLocationPurgeEnabled,
    ).toBeTrue()
    expect(
      parseWorkerEnvironment({ ...MINIMAL_ENVIRONMENT, TRIP_LOCATION_PURGE_ENABLED: 'false' })
        .tripLocationPurgeEnabled,
    ).toBeFalse()
    expect(() =>
      parseWorkerEnvironment({ ...MINIMAL_ENVIRONMENT, TRIP_LOCATION_PURGE_ENABLED: '1' }),
    ).toThrow()
  })
})
