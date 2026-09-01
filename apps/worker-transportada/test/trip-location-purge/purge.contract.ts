/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createTripLocationPurgeRoutine } from '../../src/trip-location-purge/application/trip-location-purge.routine.js'
import type { RedactTripLocations } from '../../src/trip-location-purge/application/trip-location.port.js'
import {
  resolveRetentionCutoff,
  TRIP_LOCATION_PURGE_BATCH_SIZE,
  TRIP_LOCATION_PURGE_MAX_BATCHES,
  TRIP_LOCATION_RETENTION_DAYS,
} from '../../src/trip-location-purge/domain/trip-location-purge.constant.js'
import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'

const NOW = new Date('2026-08-26T09:00:00.000Z')

const SILENT_LOGGER = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
}

function buildContext(isStopRequested: () => boolean = () => false): JobRoutineContext {
  return {
    correlationId: 'purge-contract',
    executionId: 'execution-1',
    isStopRequested,
    job: 'trip.location.purge',
    origin: 'schedule',
  }
}

function buildRoutine(redact: RedactTripLocations) {
  return createTripLocationPurgeRoutine({
    logger: SILENT_LOGGER as never,
    now: () => NOW,
    redact,
  })
}

describe('expurgo da coordenada de entrega', () => {
  /** O prazo mora no código e em `docs/SECURITY.md`, e é o mesmo número. */
  test('corta em noventa dias, contados do instante do ciclo', () => {
    expect(TRIP_LOCATION_RETENTION_DAYS).toBe(90)
    expect(resolveRetentionCutoff(NOW).toISOString()).toBe('2026-05-28T09:00:00.000Z')
  })

  test('apaga em lotes até a tabela não ter mais coordenada vencida', async () => {
    const asked: Array<{ readonly before: Date; readonly limit: number }> = []
    const remaining = [TRIP_LOCATION_PURGE_BATCH_SIZE, TRIP_LOCATION_PURGE_BATCH_SIZE, 7, 0]
    const routine = buildRoutine(async (input) => {
      asked.push(input)
      return remaining[asked.length - 1] ?? 0
    })

    const result = await routine.run(buildContext())

    expect(result.outcome).toBe('succeeded')
    expect(result.counters).toEqual({ batches: 3, redacted: 1007 })
    expect(asked).toHaveLength(4)
    expect(asked[0]?.limit).toBe(TRIP_LOCATION_PURGE_BATCH_SIZE)
    expect(asked[0]?.before.toISOString()).toBe('2026-05-28T09:00:00.000Z')
  })

  /**
   * A parada é lida no limite do lote, nunca no meio: o que já foi apagado está apagado, e o resto
   * espera a próxima batida. Parar no meio de um lote deixaria metade da coordenada de um evento.
   */
  test('larga o que ainda não começou quando o operador pede parada', async () => {
    let calls = 0
    const routine = buildRoutine(async () => {
      calls += 1
      return TRIP_LOCATION_PURGE_BATCH_SIZE
    })

    const result = await routine.run(buildContext(() => calls >= 2))

    expect(calls).toBe(2)
    expect(result.counters.batches).toBe(2)
    expect(result.outcome).toBe('succeeded')
  })

  /** Teto por ciclo: varredura que nunca termina seguraria a escrita do motorista que está na rua. */
  test('não varre sem fim: o que sobrar espera a próxima batida', async () => {
    let calls = 0
    const routine = buildRoutine(async () => {
      calls += 1
      return TRIP_LOCATION_PURGE_BATCH_SIZE
    })

    const result = await routine.run(buildContext())

    expect(calls).toBe(TRIP_LOCATION_PURGE_MAX_BATCHES)
    expect(result.counters.batches).toBe(TRIP_LOCATION_PURGE_MAX_BATCHES)
  })

  /** Base vazia é ciclo legítimo, não falha: nada vencido é o estado normal de uma instalação nova. */
  test('base sem coordenada vencida termina em sucesso sem apagar nada', async () => {
    const result = await buildRoutine(async () => 0).run(buildContext())

    expect(result).toEqual({ counters: { batches: 0, redacted: 0 }, outcome: 'succeeded' })
  })
})
