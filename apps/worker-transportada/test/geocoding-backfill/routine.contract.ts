/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createGeocodingBackfillRoutine } from '../../src/geocoding-backfill/application/geocoding-backfill.routine.js'
import { GEOCODING_BACKFILL_BATCH_SIZE } from '../../src/geocoding-backfill/domain/geocoding-backfill.constant.js'
import type { PendingGeocodingAddress } from '../../src/geocoding-backfill/application/pending-address.port.js'
import type { GeocodedAddressRecord } from '../../src/routing/application/geocoding.port.js'
import type { JobRoutineContext } from '../../src/job-run/application/job-routine.port.js'

const CONTEXT: JobRoutineContext = {
  correlationId: 'correlation-1',
  executionId: 'execution-1',
  isStopRequested: () => false,
  job: 'geocoding.backfill',
  origin: 'schedule',
}

const SILENT = { error: () => undefined, info: () => undefined, warn: () => undefined }

function pending(count: number, offset = 0): readonly PendingGeocodingAddress[] {
  return Array.from({ length: count }, (_unused, index) => ({
    addressKey: `3543402|1401${String(offset + index).padStart(4, '0')}|100`,
    cityCode: '3543402',
    postalCode: `1401${String(offset + index).padStart(4, '0')}`,
  }))
}

function coordinateFor(addressKey: string): GeocodedAddressRecord {
  return {
    addressKey,
    externalPlaceId: '',
    latitude: '-21.1800000',
    longitude: '-47.8100000',
    precision: 'postal_code',
    source: 'postal_code',
  }
}

function buildRoutine(overrides: {
  readonly geocodeCalls?: string[]
  readonly pages?: (readonly PendingGeocodingAddress[])[]
  readonly resolves?: boolean
  readonly saved?: GeocodedAddressRecord[]
  readonly stored?: readonly GeocodedAddressRecord[]
  readonly waits?: number[]
}) {
  const pages = overrides.pages ?? [[]]
  let page = 0

  return createGeocodingBackfillRoutine({
    addresses: {
      list: () => {
        const current = pages[page] ?? []
        page += 1

        return Promise.resolve(current)
      },
    },
    geocoding: {
      geocode: (request) => {
        overrides.geocodeCalls?.push(request.addressKey)

        return Promise.resolve(
          overrides.resolves === false
            ? null
            : {
                externalPlaceId: '',
                latitude: '-21.1800000',
                longitude: '-47.8100000',
                precision: 'postal_code' as const,
                source: 'postal_code' as const,
              },
        )
      },
    },
    logger: SILENT,
    repository: {
      findByKeys: () => Promise.resolve(overrides.stored ?? []),
      save: (record) => {
        overrides.saved?.push(record)

        return Promise.resolve()
      },
    },
    wait: (milliseconds) => {
      overrides.waits?.push(milliseconds)

      return Promise.resolve()
    },
  })
}

describe('geocoding backfill routine (spec 069, Fase B)', () => {
  test('closes an empty cycle without asking the provider anything', async () => {
    const geocodeCalls: string[] = []

    expect(await buildRoutine({ geocodeCalls }).run(CONTEXT)).toEqual({
      counters: { batches: 0, examined: 0, resolved: 0, unresolved: 0 },
      outcome: 'succeeded',
    })
    expect(geocodeCalls).toEqual([])
  })

  test('resolves the pending addresses and saves them', async () => {
    const saved: GeocodedAddressRecord[] = []

    expect(await buildRoutine({ pages: [pending(3), []], saved }).run(CONTEXT)).toMatchObject({
      counters: { examined: 3, resolved: 3, unresolved: 0 },
      outcome: 'succeeded',
    })
    expect(saved).toHaveLength(3)
  })

  /** RF1: endereço já em base não é tocado — é o que faz a segunda passada não custar nada. */
  test('never asks the provider for an address already in the base', async () => {
    const geocodeCalls: string[] = []
    const addresses = pending(2)
    const routine = buildRoutine({
      geocodeCalls,
      pages: [addresses, []],
      stored: addresses.map((address) => coordinateFor(address.addressKey)),
    })

    expect(await routine.run(CONTEXT)).toMatchObject({
      counters: { examined: 2, resolved: 0 },
      outcome: 'succeeded',
    })
    expect(geocodeCalls).toEqual([])
  })

  /** O mesmo endereço em cem notas é uma chamada, não cem. */
  test('asks once for an address that repeats inside a batch', async () => {
    const geocodeCalls: string[] = []
    const twice = [...pending(1), ...pending(1)]

    await buildRoutine({ geocodeCalls, pages: [twice, []] }).run(CONTEXT)

    expect(geocodeCalls).toHaveLength(1)
  })

  /**
   * ⚠️ **A população não grava o centroide de município**, e é a diferença mais importante entre ela
   * e o caminho da sugestão.
   *
   * Na sugestão, a parada precisa de **alguma** coordenada agora, e o palpite de município entra
   * marcado. Aqui não há pressa: gravar `city` deixaria o endereço em base, e a cascata **nunca mais
   * o reconsulta** — um dia de provedor fora do ar viraria uma cidade inteira degradada para sempre,
   * em silêncio. Ficar de fora custa nada e preserva a chance de acertar depois.
   */
  test('leaves an address unresolved instead of storing a municipality guess', async () => {
    const saved: GeocodedAddressRecord[] = []

    expect(
      await buildRoutine({ pages: [pending(2), []], resolves: false, saved }).run(CONTEXT),
    ).toMatchObject({ counters: { examined: 2, resolved: 0, unresolved: 2 }, outcome: 'succeeded' })
    expect(saved).toEqual([])
  })

  /** RNF4: a BrasilAPI é serviço público e gratuito — rajada sem intervalo é bloqueio merecido. */
  test('pauses between batches', async () => {
    const waits: number[] = []

    await buildRoutine({
      pages: [pending(GEOCODING_BACKFILL_BATCH_SIZE), pending(1, 1000), []],
      waits,
    }).run(CONTEXT)

    expect(waits.length).toBeGreaterThan(0)
    for (const wait of waits) expect(wait).toBeGreaterThan(0)
  })

  /** Página menor que o lote é o fim da fila: pedir a próxima seria uma consulta para nada. */
  test('stops asking once a batch comes back short', async () => {
    const geocodeCalls: string[] = []

    await buildRoutine({ geocodeCalls, pages: [pending(2), pending(2, 500)] }).run(CONTEXT)

    expect(geocodeCalls).toHaveLength(2)
  })

  /** Parada pedida é lida no limite do lote, nunca no meio — o que resolveu fica gravado. */
  test('drops what has not started when a stop is requested', async () => {
    const geocodeCalls: string[] = []
    const routine = buildRoutine({
      geocodeCalls,
      pages: [pending(GEOCODING_BACKFILL_BATCH_SIZE), pending(GEOCODING_BACKFILL_BATCH_SIZE, 1000)],
    })

    const result = await routine.run({ ...CONTEXT, isStopRequested: () => true })

    expect(geocodeCalls).toEqual([])
    expect(result.counters.batches).toBe(0)
  })
})
