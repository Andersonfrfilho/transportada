/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  applyResolvedCoordinates,
  buildGeocodeRequests,
} from '../../src/routing/application/resolve-stop-coordinates.use-case.js'
import type { GeocodedAddressRecord } from '../../src/routing/application/geocoding.port.js'
import type { RouteOptimizationStop } from '../../src/routing/application/route-optimization.effect.js'

function stop(overrides: Partial<RouteOptimizationStop> = {}): RouteOptimizationStop {
  return {
    addressKey: '3550308|01310100|1000',
    documentIds: [],
    excludedFromOptimization: true,
    label: 'Cliente',
    latitude: '0',
    longitude: '0',
    serviceTimeSeconds: 600,
    stopId: 'stop-1',
    weightEstimated: false,
    weightKilograms: 10,
    windowEndSeconds: null,
    windowStartSeconds: null,
    ...overrides,
  }
}

function record(overrides: Partial<GeocodedAddressRecord> = {}): GeocodedAddressRecord {
  return {
    addressKey: '3550308|01310100|1000',
    externalPlaceId: '',
    latitude: '-23.5617698',
    longitude: '-46.6553299',
    precision: 'postal_code',
    source: 'postal_code',
    ...overrides,
  }
}

describe('resolving stop coordinates before the matrix (spec 069, T009)', () => {
  test('asks only for the stops that have no fine coordinate', () => {
    const requests = buildGeocodeRequests([
      stop(),
      stop({ addressKey: '3543402|14015000|20', excludedFromOptimization: false }),
    ])

    expect(requests.map((request) => request.addressKey)).toEqual(['3550308|01310100|1000'])
  })

  /** O mesmo endereço em cem notas é uma chamada, não cem. */
  test('asks once for an address that repeats across stops', () => {
    const requests = buildGeocodeRequests([stop({ stopId: 'a' }), stop({ stopId: 'b' })])

    expect(requests).toHaveLength(1)
  })

  /**
   * A requisição é montada da própria chave: a cascata do worker precisa só de CEP e município, e os
   * dois estão nela. Um `join` com `nfe_addresses` para buscar logradouro seria trabalho para um
   * provedor que não roda nesta app.
   */
  test('takes the postal code and the city code from the address key', () => {
    const [request] = buildGeocodeRequests([stop()])

    expect(request).toMatchObject({ cityCode: '3550308', number: '1000', postalCode: '01310100' })
  })

  test('skips a stop whose address key is not the expected shape', () => {
    expect(buildGeocodeRequests([stop({ addressKey: 'sem-cep' })])).toEqual([])
  })

  test('brings a resolved stop into the optimization', () => {
    const [resolved] = applyResolvedCoordinates({
      resolved: new Map([['3550308|01310100|1000', record()]]),
      stops: [stop()],
    })

    expect(resolved).toMatchObject({
      excludedFromOptimization: false,
      latitude: '-23.5617698',
      longitude: '-46.6553299',
    })
  })

  /**
   * ADR-0044 §5: centroide de município é palpite de ~8 km. Ele **entra em base** — o endereço passa
   * a ter um ponto no mapa — e **continua fora** da otimização. Trocar isso poria o palpite dentro
   * da rota, que é o modo de falha da §1.
   */
  test('keeps a municipality centroid out of the optimization', () => {
    const [resolved] = applyResolvedCoordinates({
      resolved: new Map([['3550308|01310100|1000', record({ precision: 'city', source: 'city' })]]),
      stops: [stop()],
    })

    expect(resolved).toMatchObject({ excludedFromOptimization: true, latitude: '-23.5617698' })
  })

  test('leaves an unresolved stop exactly as it was', () => {
    const original = stop()

    expect(applyResolvedCoordinates({ resolved: new Map(), stops: [original] })[0]).toBe(original)
  })

  /** Nenhuma parada **sai** da otimização aqui: a cascata só resolve o que estava ausente. */
  test('never removes a stop that was already optimizable', () => {
    const already = stop({ excludedFromOptimization: false, latitude: '-21.2', longitude: '-47.8' })
    const [resolved] = applyResolvedCoordinates({
      resolved: new Map([['3550308|01310100|1000', record({ precision: 'city' })]]),
      stops: [already],
    })

    expect(resolved).toBe(already)
  })
})
