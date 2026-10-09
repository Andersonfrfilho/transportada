/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 259 T2.3: `resolveTripOccupancyFromFacts` é a conta única da ocupação — o detalhe e o lote da
 * listagem a chamam. Provado sem banco: sem veículo, sem capacidade, com carreta, e com fatos que
 * cobrem mais notas do que a viagem (o caso do lote).
 */
import { describe, expect, test } from 'bun:test'

import {
  EMPTY_OCCUPANCY_CARGO_FACTS,
  hasKnownTripCapacity,
  resolveTripOccupancyFromFacts,
  type OccupancyCargoFacts,
  type OccupancyVehicleFacts,
} from '../../src/trips/infrastructure/trip-occupancy.support.js'
import { buildTripListOccupancy } from '../../src/trips/domain/trip-list-occupancy.policy.js'

const VEHICLE_ID = 'veiculo-1'

function vehicleOf(overrides: Partial<OccupancyVehicleFacts> = {}): OccupancyVehicleFacts {
  return {
    bodyType: '00',
    capacityKg: '3000.000',
    capacityM3: '20.000',
    cargoHeightM: '0.000',
    cargoLengthM: '0.000',
    cargoWidthM: '0.000',
    id: VEHICLE_ID,
    loadingAccess: 'rear',
    vehicleType: 'toco',
    ...overrides,
  }
}

function cargoOf(documentIds: readonly string[]): OccupancyCargoFacts {
  return {
    ...EMPTY_OCCUPANCY_CARGO_FACTS,
    factorBySpecies: new Map([['CAIXA', '0.050000']]),
    volumeByDocument: new Map(
      documentIds.map((documentId) => [documentId, { quantity: '10', species: 'CAIXA' }]),
    ),
  }
}

describe('resolveTripOccupancyFromFacts (spec 259 T2.3)', () => {
  test('sem veículo devolve a forma órfã de sempre, sem motivo nem ocupação', () => {
    const result = resolveTripOccupancyFromFacts({
      facts: {
        cargo: EMPTY_OCCUPANCY_CARGO_FACTS,
        reference: undefined,
        trailer: undefined,
        vehicle: undefined,
      },
      nfeDocumentIds: ['nota-1'],
      vehicleId: null,
    })

    expect(result).toMatchObject({
      bedDimensions: null,
      bodyType: null,
      capacityM3: null,
      capacityUnknownReason: null,
      capacityUnknownVehicleId: null,
      loadingAccess: 'rear',
      maxPayloadKg: null,
      occupancy: null,
    })
    expect(result.volumeByDocument.size).toBe(0)
  })

  test('cavalo sem carreta não tem capacidade, e o motivo aponta o veículo da viagem', () => {
    const tractor = vehicleOf({ capacityM3: '0.000', vehicleType: 'tractor_unit' })
    const facts = { reference: undefined, trailer: undefined, vehicle: tractor }

    expect(hasKnownTripCapacity(facts)).toBe(false)
    const result = resolveTripOccupancyFromFacts({
      facts: { ...facts, cargo: EMPTY_OCCUPANCY_CARGO_FACTS },
      nfeDocumentIds: ['nota-1'],
      vehicleId: VEHICLE_ID,
    })

    expect(result.occupancy).toBeNull()
    expect(result.capacityUnknownReason).toBe('trailerMissing')
    expect(result.capacityUnknownVehicleId).toBe(VEHICLE_ID)
  })

  test('com carreta, quem carrega é a carreta: capacidade e teto de peso são os dela', () => {
    const tractor = vehicleOf({
      capacityKg: '9000.000',
      capacityM3: '0.000',
      vehicleType: 'tractor_unit',
    })
    const trailer = vehicleOf({
      capacityKg: '5000.000',
      capacityM3: '30.000',
      id: 'carreta-1',
      vehicleType: '',
    })

    const result = resolveTripOccupancyFromFacts({
      facts: { cargo: cargoOf(['nota-1']), reference: undefined, trailer, vehicle: tractor },
      nfeDocumentIds: ['nota-1'],
      vehicleId: VEHICLE_ID,
    })

    expect(result.capacityM3).toBe('30.000000')
    expect(result.maxPayloadKg).toBe('5000.000')
    expect(result.occupancy?.occupancyRatio).toBe('0.0167')
  })

  test('fatos que cobrem mais notas que a viagem dão o mesmo resultado (o caso do lote)', () => {
    const vehicle = vehicleOf()
    const alone = resolveTripOccupancyFromFacts({
      facts: { cargo: cargoOf(['nota-1']), reference: undefined, trailer: undefined, vehicle },
      nfeDocumentIds: ['nota-1'],
      vehicleId: VEHICLE_ID,
    })
    const inBatch = resolveTripOccupancyFromFacts({
      facts: {
        cargo: cargoOf(['nota-1', 'nota-de-outra-viagem']),
        reference: undefined,
        trailer: undefined,
        vehicle,
      },
      nfeDocumentIds: ['nota-1'],
      vehicleId: VEHICLE_ID,
    })

    expect(inBatch.occupancy).toEqual(alone.occupancy)
    expect(inBatch.volumeByDocument).toEqual(alone.volumeByDocument)
    expect(alone.occupancy?.documentsWithoutVolume).toBe(0)
  })
})

describe('buildTripListOccupancy (spec 259 RF1)', () => {
  test('é o recorte do painel de carga, sem inventar zero para o que falta', () => {
    expect(
      buildTripListOccupancy({
        capacityUnknownReason: 'trailerMissing',
        cargoWeight: { documentsWithoutWeight: 1, payloadRatio: null, source: 'estimated' },
        volume: null,
      }),
    ).toEqual({
      capacityUnknownReason: 'trailerMissing',
      volume: null,
      weight: { documentsWithoutWeight: 1, payloadRatio: null, source: 'estimated' },
    })
  })
})
