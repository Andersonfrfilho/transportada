/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { CARGO_LAYOUT_POLICY_VERSION } from '@adatechnology/cargo-placement'

import { createEagerCargoLayoutRequest } from '../../src/trips/infrastructure/eager-cargo-layout-request.support.js'
import type { BuildCargoLayoutInputParams } from '../../src/trips/domain/cargo-layout-hash.types.js'
import type { UpsertCargoLayoutRequestParams } from '../../src/trips/application/cargo-layout-request.types.js'
import type { TripTransaction } from '../../src/trips/infrastructure/trip-queryable.type.js'

const COMPANY_ID = '11111111-1111-4111-8111-111111111111'
const TRIP_ID = '22222222-2222-4222-8222-222222222222'
const FAKE_TRANSACTION = {} as TripTransaction
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LEASE_MS = 280_000
const BED = { heightM: '2', lengthM: '6', source: 'measured', widthM: '2.4' } as const

function buildInput(
  overrides: Partial<BuildCargoLayoutInputParams> = {},
): BuildCargoLayoutInputParams {
  return {
    bedDimensions: BED,
    capacityM3: '10',
    loadingAccess: 'rear',
    securesCargo: false,
    stops: [
      {
        boxes: [
          {
            count: 1,
            documentId: 'doc-1',
            heightMm: 300,
            lengthMm: 400,
            widthMm: 200,
          },
        ],
        documentsWithoutVolume: 0,
        label: 'A',
        sequence: 1,
        volumeM3: null,
      },
      { boxes: [], documentsWithoutVolume: 0, label: 'B', sequence: 2, volumeM3: null },
    ],
    ...overrides,
  }
}

function createHarness(input: BuildCargoLayoutInputParams | null): {
  readonly requestCargoLayoutForTrip: ReturnType<typeof createEagerCargoLayoutRequest>
  readonly upsertCalls: UpsertCargoLayoutRequestParams[]
} {
  const upsertCalls: UpsertCargoLayoutRequestParams[] = []
  const requestCargoLayoutForTrip = createEagerCargoLayoutRequest({
    leaseMs: LEASE_MS,
    readInput: async () => input,
    upsert: async (_transaction, params) => {
      upsertCalls.push(params)
      return { enqueued: true, layoutId: 'layout-1', status: 'queued' }
    },
  })
  return { requestCargoLayoutForTrip, upsertCalls }
}

describe('eager cargo layout request composition contract (spec 145 D6/D7)', () => {
  test('the same trip input produces the same hash sent to the upsert', async () => {
    const { requestCargoLayoutForTrip, upsertCalls } = createHarness(buildInput())

    await requestCargoLayoutForTrip(FAKE_TRANSACTION, { companyId: COMPANY_ID, tripId: TRIP_ID })
    await requestCargoLayoutForTrip(FAKE_TRANSACTION, { companyId: COMPANY_ID, tripId: TRIP_ID })

    expect(upsertCalls).toHaveLength(2)
    expect(upsertCalls[1]?.inputHash).toBe(upsertCalls[0]?.inputHash)
  })

  test('reordering the stops changes the hash (D6)', async () => {
    const original = createHarness(buildInput())
    await original.requestCargoLayoutForTrip(FAKE_TRANSACTION, {
      companyId: COMPANY_ID,
      tripId: TRIP_ID,
    })

    const reorderedInput = buildInput()
    const reordered = createHarness({
      ...reorderedInput,
      stops: [...reorderedInput.stops].reverse(),
    })
    await reordered.requestCargoLayoutForTrip(FAKE_TRANSACTION, {
      companyId: COMPANY_ID,
      tripId: TRIP_ID,
    })

    expect(reordered.upsertCalls[0]?.inputHash).not.toBe(original.upsertCalls[0]?.inputHash)
  })

  test('a missing trip answers null and never calls the upsert', async () => {
    const { requestCargoLayoutForTrip, upsertCalls } = createHarness(null)

    const result = await requestCargoLayoutForTrip(FAKE_TRANSACTION, {
      companyId: COMPANY_ID,
      tripId: TRIP_ID,
    })

    expect(result).toBeNull()
    expect(upsertCalls).toHaveLength(0)
  })

  test('a given correlationId is passed through unchanged', async () => {
    const { requestCargoLayoutForTrip, upsertCalls } = createHarness(buildInput())

    await requestCargoLayoutForTrip(FAKE_TRANSACTION, {
      companyId: COMPANY_ID,
      correlationId: 'trace-1',
      tripId: TRIP_ID,
    })

    expect(upsertCalls[0]?.correlationId).toBe('trace-1')
  })

  /** D5: o worker empacota a partir da coluna `input`, sem reler a viagem — o rótulo tem de estar lá. */
  test('stores the full layout input, labels included, while the hash ignores the labels', async () => {
    const labelled = buildInput()
    const withLabels = createHarness({
      ...labelled,
      stops: labelled.stops.map((stop) => ({
        ...stop,
        clientName: 'Mercado Central',
        noteNumbers: ['4521'],
      })),
    })
    const withoutLabels = createHarness(buildInput())

    await withLabels.requestCargoLayoutForTrip(FAKE_TRANSACTION, {
      companyId: COMPANY_ID,
      tripId: TRIP_ID,
    })
    await withoutLabels.requestCargoLayoutForTrip(FAKE_TRANSACTION, {
      companyId: COMPANY_ID,
      tripId: TRIP_ID,
    })

    const stored = withLabels.upsertCalls[0]?.input
    expect(stored?.stops[0]?.label).toBe('A')
    expect(stored?.stops[0]?.clientName).toBe('Mercado Central')
    expect(stored?.stops[0]?.noteNumbers).toEqual(['4521'])
    expect(stored?.stops[0]?.boxes?.[0]?.documentId).toBe('doc-1')
    expect(stored?.policyVersion).toBe(CARGO_LAYOUT_POLICY_VERSION)
    expect(withLabels.upsertCalls[0]?.inputHash).toBe(withoutLabels.upsertCalls[0]?.inputHash)
  })

  /** D15: sem capacidade não há planta possível — nada entra na fila, e o estado é `unavailable`. */
  test('an unknown capacity answers null and never calls the upsert', async () => {
    const { requestCargoLayoutForTrip, upsertCalls } = createHarness(
      buildInput({ capacityM3: null }),
    )

    const result = await requestCargoLayoutForTrip(FAKE_TRANSACTION, {
      companyId: COMPANY_ID,
      tripId: TRIP_ID,
    })

    expect(result).toBeNull()
    expect(upsertCalls).toHaveLength(0)
  })

  /** D10: sem baú medido o pacote nem entra em cena — e ele devolveria `placement: null` como `ready`. */
  test.each([
    ['null', null],
    ['absent', undefined],
  ])('a %s bed answers null and never calls the upsert', async (_name, bedDimensions) => {
    const base = buildInput()
    const withoutBed: BuildCargoLayoutInputParams = {
      capacityM3: base.capacityM3,
      loadingAccess: 'rear',
      securesCargo: false,
      stops: base.stops,
    }
    const { requestCargoLayoutForTrip, upsertCalls } = createHarness(
      bedDimensions === null ? { ...withoutBed, bedDimensions: null } : withoutBed,
    )

    const result = await requestCargoLayoutForTrip(FAKE_TRANSACTION, {
      companyId: COMPANY_ID,
      tripId: TRIP_ID,
    })

    expect(result).toBeNull()
    expect(upsertCalls).toHaveLength(0)
  })

  test('capacity and bed known: the upsert is called with the injected lease', async () => {
    const { requestCargoLayoutForTrip, upsertCalls } = createHarness(buildInput())

    await requestCargoLayoutForTrip(FAKE_TRANSACTION, { companyId: COMPANY_ID, tripId: TRIP_ID })

    expect(upsertCalls).toHaveLength(1)
    expect(upsertCalls[0]?.leaseMs).toBe(LEASE_MS)
  })

  test('an absent correlationId is generated as a v4 uuid', async () => {
    const { requestCargoLayoutForTrip, upsertCalls } = createHarness(buildInput())

    await requestCargoLayoutForTrip(FAKE_TRANSACTION, { companyId: COMPANY_ID, tripId: TRIP_ID })

    expect(upsertCalls[0]?.correlationId).toMatch(UUID_V4)
  })
})
