/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, it } from 'bun:test'

import { readFileSync } from 'node:fs'

import {
  computeTripProgress,
  isStopResolved,
} from '@/modules/driver-trip/shared/driverTripProgress.service'
import { computeTripNoteProgress } from '@/modules/driver-trip/shared/driverTripNoteProgress.service'
import type {
  DriverTrip,
  DriverTripDocument,
  DriverTripStop,
} from '@/modules/driver-trip/shared/driverTrip.types'

const NOW = '2026-09-03T13:00:00.000Z'

function buildDocument(overrides: Partial<DriverTripDocument> = {}): DriverTripDocument {
  return {
    accessKey: '0'.repeat(44),
    deliveredAt: null,
    deliveryProof: null,
    grossWeight: '10.000',
    id: 'document-1',
    number: '1001',
    proofPending: false,
    recipientName: 'Destinatário',
    returnReason: null,
    separationStatus: 'loaded',
    series: '1',
    totalAmount: '100.00',
    volumeCount: '1',
    ...overrides,
  }
}

function buildStop(overrides: Partial<DriverTripStop> = {}): DriverTripStop {
  return {
    arrivedAt: null,
    completedAt: null,
    deliveryProof: null,
    deliveryWindowEnd: null,
    deliveryWindowStart: null,
    documents: [buildDocument()],
    id: 'stop-1',
    label: 'Rua das Entregas, 100',
    latitude: null,
    longitude: null,
    schedule: null,
    sequence: 1,
    ...overrides,
  }
}

function buildTrip(stops: readonly DriverTripStop[]): DriverTrip {
  return { id: 'trip-1', manifest: null, status: 'dispatched', stops, vehiclePlate: 'ABC1D23' }
}

describe('a barra de progresso da viagem', () => {
  it('parada só resolve com toda nota em delivered ou returned', () => {
    const half = buildStop({
      documents: [
        buildDocument({ id: 'a', separationStatus: 'delivered' }),
        buildDocument({ id: 'b', separationStatus: 'loaded' }),
      ],
    })
    expect(isStopResolved(half)).toBe(false)

    const settled = buildStop({
      documents: [
        buildDocument({ id: 'a', separationStatus: 'delivered' }),
        buildDocument({ id: 'b', separationStatus: 'returned' }),
      ],
    })
    expect(isStopResolved(settled)).toBe(true)
  })

  /** A corrente é a de `findCurrentStop` — a primeira com `completedAt` nulo, como na lista. */
  it('a corrente é a primeira com completedAt nulo, e só ela', () => {
    const progress = computeTripProgress(
      buildTrip([
        buildStop({
          completedAt: NOW,
          documents: [buildDocument({ separationStatus: 'delivered' })],
          id: 'stop-1',
        }),
        buildStop({ id: 'stop-2' }),
        buildStop({ id: 'stop-3' }),
      ]),
    )

    expect(progress.segments.map((segment) => segment.state)).toEqual([
      'resolved',
      'current',
      'pending',
    ])
    expect(progress.resolvedCount).toBe(1)
    expect(progress.totalCount).toBe(3)
  })

  it('viagem toda entregue não tem parada corrente', () => {
    const progress = computeTripProgress(
      buildTrip([
        buildStop({
          completedAt: NOW,
          documents: [buildDocument({ separationStatus: 'delivered' })],
          id: 'stop-1',
        }),
        buildStop({
          completedAt: NOW,
          documents: [buildDocument({ separationStatus: 'returned' })],
          id: 'stop-2',
        }),
      ]),
    )

    expect(progress.segments.every((segment) => segment.state === 'resolved')).toBe(true)
    expect(progress.resolvedCount).toBe(2)
  })

  /**
   * A definição é UMA: a barra destaca a mesma parada que a lista (`findCurrentStop`). Notas todas
   * resolvidas com `completedAt` nulo ainda é a parada corrente — o servidor não a fechou.
   */
  it('a barra e a lista apontam a mesma corrente quando os dois critérios divergem', () => {
    const progress = computeTripProgress(
      buildTrip([
        buildStop({ documents: [buildDocument({ separationStatus: 'delivered' })], id: 'stop-1' }),
        buildStop({ id: 'stop-2' }),
      ]),
    )

    expect(progress.segments.map((segment) => segment.state)).toEqual(['current', 'pending'])
  })

  it('viagem sem parada devolve barra vazia, nunca erro', () => {
    const progress = computeTripProgress(buildTrip([]))
    expect(progress.segments).toEqual([])
    expect(progress.totalCount).toBe(0)
  })
})

describe('a porcentagem da viagem, junto da barra (pedido de 25/09; spec 198 D7)', () => {
  it('conta notas entregues ou devolvidas sobre o total, arredondando para baixo', () => {
    const trip = buildTrip([
      buildStop({
        documents: [
          buildDocument({ id: 'a', separationStatus: 'delivered' }),
          buildDocument({ id: 'b', separationStatus: 'returned' }),
        ],
        id: 'stop-1',
      }),
      buildStop({
        documents: [
          buildDocument({ id: 'c', separationStatus: 'loaded' }),
          buildDocument({ id: 'd', separationStatus: 'delivered' }),
          buildDocument({ id: 'e', separationStatus: 'loaded' }),
          buildDocument({ id: 'f', separationStatus: 'loaded' }),
        ],
        id: 'stop-2',
      }),
    ])
    expect(computeTripNoteProgress(trip)).toEqual({ percent: 50, resolved: 3, total: 6 })
  })

  it('1 de 3 é 33%, nunca 34%', () => {
    const trip = buildTrip([
      buildStop({
        documents: [
          buildDocument({ id: 'a', separationStatus: 'delivered' }),
          buildDocument({ id: 'b' }),
          buildDocument({ id: 'c' }),
        ],
      }),
    ])
    expect(computeTripNoteProgress(trip)?.percent).toBe(33)
  })

  it('viagem sem nota não mostra porcentagem', () => {
    expect(computeTripNoteProgress(buildTrip([buildStop({ documents: [] })]))).toBeUndefined()
  })

  it('a barra mostra a porcentagem e a contagem de notas ao lado', () => {
    const source = readFileSync(
      'src/modules/driver-trip/components/DriverTripProgress.component.tsx',
      'utf8',
    )
    expect(source).toInclude('computeTripNoteProgress(trip)')
    expect(source).toInclude("t('progress.percent'")
  })
})
