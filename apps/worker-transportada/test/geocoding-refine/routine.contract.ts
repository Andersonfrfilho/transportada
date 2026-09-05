/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createGeocodingRefineRoutine } from '../../src/geocoding-refine/application/geocoding-refine.routine.js'
import type {
  PendingRefinement,
  PendingRefinementSource,
  RefinedAddressRepository,
} from '../../src/geocoding-refine/application/pending-refinement.port.js'
import type {
  PlaceLookupPort,
  PlaceLookupResult,
} from '../../src/geocoding-refine/application/place-lookup.port.js'
import type { GeocodeResult, GeocodingPort } from '../../src/routing/application/geocoding.port.js'

const CONTEXT = {
  correlationId: 'correlation-1',
  executionId: 'execution-1',
  isStopRequested: () => false,
  job: 'geocoding.refine' as const,
  origin: 'schedule' as const,
}

function pending(addressKey: string): PendingRefinement {
  return {
    request: {
      addressKey,
      city: 'Serrana',
      cityCode: '3551504',
      district: 'Centro',
      number: '100',
      postalCode: '14150000',
      state: 'SP',
      street: 'Rua Um',
    },
  }
}

function sourceOf(items: readonly PendingRefinement[]): PendingRefinementSource {
  let served = false
  return {
    list: () => {
      if (served) return Promise.resolve([])
      served = true
      return Promise.resolve(items)
    },
  }
}

type RecordedWrites = {
  readonly marked: string[]
  readonly replaced: string[]
}

function repositoryOf(writes: RecordedWrites): RefinedAddressRepository {
  return {
    markPaid: (addressKey) => {
      writes.marked.push(addressKey)
      return Promise.resolve()
    },
    replace: (input) => {
      writes.replaced.push(input.addressKey)
      return Promise.resolve()
    },
  }
}

function portOf(result: GeocodeResult): GeocodingPort {
  return { geocode: () => Promise.resolve(result) }
}

const SILENT_LOGGER = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
}

/** O degrau 1 que não resolve: é o que abre caminho para o 2b. */
const ONLY_THE_MUNICIPALITY: GeocodeResult = { cause: 'not_found', coordinate: null }

function placesOf(result: PlaceLookupResult): PlaceLookupPort {
  return { lookup: () => Promise.resolve(result) }
}

function runWith(input: {
  readonly geocoding: GeocodingPort
  readonly items?: readonly PendingRefinement[]
  readonly places?: PlaceLookupPort
  readonly writes: RecordedWrites
}) {
  return createGeocodingRefineRoutine({
    addresses: sourceOf(input.items ?? [pending('3551504|14150000|100')]),
    geocoding: input.geocoding,
    logger: SILENT_LOGGER as never,
    ...(input.places === undefined ? {} : { places: input.places }),
    repository: repositoryOf(input.writes),
    wait: () => Promise.resolve(),
  }).run(CONTEXT)
}

describe('geocoding refine routine (ADR-0062)', () => {
  test('buys the finer coordinate and stamps it in the same write', async () => {
    const writes: RecordedWrites = { marked: [], replaced: [] }

    const result = await runWith({
      geocoding: portOf({
        cause: null,
        coordinate: {
          externalPlaceId: 'place-1',
          latitude: '-21.5534349',
          longitude: '-47.7042824',
          precision: 'rooftop',
          source: 'google',
        },
      }),
      writes,
    })

    expect(writes.replaced).toEqual(['3551504|14150000|100'])
    expect(writes.marked).toEqual([])
    expect(result.counters.refined).toBe(1)
    expect(result.outcome).toBe('succeeded')
  })

  /**
   * `APPROXIMATE` do Google vira `city`: é o mesmo centroide de município que já estava guardado.
   * Pagamos e não melhorou — e o carimbo é justamente o que impede pagar de novo todo mês.
   */
  test('stamps without replacing when the provider answers with the same municipality', async () => {
    const writes: RecordedWrites = { marked: [], replaced: [] }

    const result = await runWith({
      geocoding: portOf({
        cause: null,
        coordinate: {
          externalPlaceId: 'place-1',
          latitude: '-21.6',
          longitude: '-47.7',
          precision: 'city',
          source: 'google',
        },
      }),
      writes,
    })

    expect(writes.replaced).toEqual([])
    expect(writes.marked).toEqual(['3551504|14150000|100'])
    expect(result.counters.unchanged).toBe(1)
  })

  test('stamps when the provider answers that it does not know the address', async () => {
    const writes: RecordedWrites = { marked: [], replaced: [] }

    const result = await runWith({
      geocoding: portOf({ cause: 'not_found', coordinate: null }),
      writes,
    })

    expect(writes.marked).toEqual(['3551504|14150000|100'])
    expect(result.counters.not_found).toBe(1)
  })

  /**
   * ⚠️ **O contrato que dá teto ao gasto pelo outro lado.** Erro de transporte não é resposta e não
   * cobra: carimbar aqui queimaria a chance única do endereço sem ter comprado nada, e ele ficaria
   * no centroide para sempre por causa de um minuto de rede ruim.
   */
  test('never stamps a transport error — the address keeps its one paid chance', async () => {
    const writes: RecordedWrites = { marked: [], replaced: [] }

    const result = await runWith({
      geocoding: portOf({ cause: 'transport_error', coordinate: null }),
      writes,
    })

    expect(writes.marked).toEqual([])
    expect(writes.replaced).toEqual([])
    expect(result.counters.deferred).toBe(1)
    expect(result.outcome).toBe('succeeded')
  })

  test('never stamps when the provider is thrown at instead of answering', async () => {
    const writes: RecordedWrites = { marked: [], replaced: [] }

    const result = await runWith({
      geocoding: { geocode: () => Promise.reject(new Error('socket hang up')) },
      writes,
    })

    expect(writes.marked).toEqual([])
    expect(result.counters.deferred).toBe(1)
  })

  /** RNF1: o ciclo conta e nomeia a causa, e **nunca** o endereço. */
  test('logs counts and causes without ever naming an address', async () => {
    const lines: { readonly message: string; readonly meta: unknown }[] = []
    const writes: RecordedWrites = { marked: [], replaced: [] }

    await createGeocodingRefineRoutine({
      addresses: sourceOf([pending('3551504|14150000|100')]),
      geocoding: portOf({ cause: 'not_found', coordinate: null }),
      logger: {
        ...SILENT_LOGGER,
        info: (message: string, meta: unknown) => lines.push({ message, meta }),
      } as never,
      repository: repositoryOf(writes),
      wait: () => Promise.resolve(),
    }).run(CONTEXT)

    expect(lines).toHaveLength(1)
    expect(lines[0]?.message).toBe('geocoding_refine_cycle_finished')
    expect(JSON.stringify(lines[0]?.meta)).not.toContain('14150000')
    expect(JSON.stringify(lines[0]?.meta)).not.toContain('Rua Um')
  })

  test('closes an empty cycle at zero instead of asking the provider anything', async () => {
    const writes: RecordedWrites = { marked: [], replaced: [] }
    let asked = 0

    const result = await runWith({
      geocoding: {
        geocode: () => {
          asked += 1
          return Promise.resolve({ cause: 'not_found' as const, coordinate: null })
        },
      },
      items: [],
      writes,
    })

    expect(asked).toBe(0)
    expect(result.counters.examined).toBe(0)
  })
})

describe('o degrau 2b: a busca de lugar quando a geocodificação só acha o município', () => {
  const PLACE = {
    cityName: 'Serrana',
    latitude: '-21.5534349',
    longitude: '-47.7042824',
    placeId: 'places/ChIJXdwM7l43uJQR',
    streetNumber: '100',
  }
  const FOUND: PlaceLookupResult = { cause: null, place: PLACE }

  test('grava a porta que a Places achou quando a Geocoding desistiu', async () => {
    const writes: RecordedWrites = { marked: [], replaced: [] }

    const result = await runWith({
      geocoding: portOf(ONLY_THE_MUNICIPALITY),
      places: placesOf(FOUND),
      writes,
    })

    expect(writes.replaced).toEqual(['3551504|14150000|100'])
    expect(writes.marked).toEqual([])
    expect(result.counters.refined).toBe(1)
  })

  /**
   * ⚠️ **A guarda que impede coordenada de outro prédio.** Medido: pedir o número 99999 devolve o
   * 533 da mesma rua, calado. O número que volta tem de ser o que se pediu.
   */
  test('recusa e carimba quando o número que volta não é o pedido', async () => {
    const writes: RecordedWrites = { marked: [], replaced: [] }

    const result = await runWith({
      geocoding: portOf(ONLY_THE_MUNICIPALITY),
      places: placesOf({ cause: null, place: { ...PLACE, streetNumber: '999' } }),
      writes,
    })

    expect(writes.replaced).toEqual([])
    expect(writes.marked).toEqual(['3551504|14150000|100'])
    expect(result.counters.place_number_mismatch).toBe(1)
  })

  /** Rua inventada devolve lista vazia — a recusa que torna o degrau seguro. Pago, e sem melhora. */
  test('carimba quando a Places também não acha', async () => {
    const writes: RecordedWrites = { marked: [], replaced: [] }

    const result = await runWith({
      geocoding: portOf(ONLY_THE_MUNICIPALITY),
      places: placesOf({ cause: 'no_result', place: null }),
      writes,
    })

    expect(writes.marked).toEqual(['3551504|14150000|100'])
    expect(result.counters.place_no_result).toBe(1)
  })

  /**
   * ⚠️ API desabilitada no projeto responde `PERMISSION_DENIED`, e isso **não** é ausência de
   * endereço: carimbar aqui queimaria a chance paga única sem ter perguntado nada.
   */
  test('adia sem carimbar quando o provedor recusa a chamada', async () => {
    const writes: RecordedWrites = { marked: [], replaced: [] }

    const result = await runWith({
      geocoding: portOf(ONLY_THE_MUNICIPALITY),
      places: placesOf({ cause: 'transport_error', place: null }),
      writes,
    })

    expect(writes.marked).toEqual([])
    expect(writes.replaced).toEqual([])
    expect(result.counters.deferred).toBe(1)
  })

  /** Sem o degrau 2b configurado a rotina se comporta exatamente como antes dele existir. */
  test('sem provedor de lugar, carimba como antes', async () => {
    const writes: RecordedWrites = { marked: [], replaced: [] }

    const result = await runWith({ geocoding: portOf(ONLY_THE_MUNICIPALITY), writes })

    expect(writes.marked).toEqual(['3551504|14150000|100'])
    expect(result.counters.not_found).toBe(1)
  })

  /** A Places só é perguntada quando o degrau 1 falha: coordenada boa não custa segunda chamada. */
  test('não pergunta à Places quando a Geocoding resolveu', async () => {
    const writes: RecordedWrites = { marked: [], replaced: [] }
    let asked = 0

    await runWith({
      geocoding: portOf({
        cause: null,
        coordinate: {
          externalPlaceId: 'place-1',
          latitude: '-21.5',
          longitude: '-47.7',
          precision: 'rooftop',
          source: 'google',
        },
      }),
      places: {
        lookup: () => {
          asked += 1
          return Promise.resolve(FOUND)
        },
      },
      writes,
    })

    expect(asked).toBe(0)
  })
})
