/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { readFile } from 'node:fs/promises'

import type { ResolvedCargoLayout } from '@adatechnology/cargo-placement'

import {
  CARGO_LAYOUT_READ_STATUSES,
  UNAVAILABLE_CARGO_LAYOUT_STATE,
  resolveCargoLayoutReading,
} from '../../src/trips/domain/cargo-layout-state.policy.js'
import type { StoredCargoLayoutRow } from '../../src/trips/domain/cargo-layout-state.types.js'

const FRONTEND_CONSTANT = new URL(
  '../../../frontend-transportada/src/modules/trip/shared/trip.constant.ts',
  import.meta.url,
)
const FRONTEND_TYPES = new URL(
  '../../../frontend-transportada/src/modules/trip/shared/trip.types.ts',
  import.meta.url,
)

const FRESH_COMPUTED_AT = '2026-09-12T10:00:00.000Z'
const OLD_COMPUTED_AT = '2026-09-11T10:00:00.000Z'

function layoutWith(reasons: readonly string[]): ResolvedCargoLayout {
  return {
    placement: {
      layers: [],
      source: 'measured',
      unplaced: reasons.map((reason) => ({ count: 1, label: 'Caixa', reason })),
    },
  } as unknown as ResolvedCargoLayout
}

const FRESH_LAYOUT = layoutWith([])
const OLD_LAYOUT = layoutWith(['bedFull'])

function row(overrides: Partial<StoredCargoLayoutRow>): StoredCargoLayoutRow {
  return {
    computedAt: null,
    errorCode: '',
    layout: null,
    leaseExpired: false,
    status: 'queued',
    ...overrides,
  }
}

const PREVIOUS_READY = { computedAt: OLD_COMPUTED_AT, layout: OLD_LAYOUT }

function readArrayLiteral(source: string, name: string): readonly string[] {
  const match = new RegExp(`export const ${name} = \\[([^\\]]*)\\]`).exec(source)
  return [...(match?.[1] ?? '').matchAll(/'([^']+)'/g)].map((item) => item[1] ?? '')
}

describe('stored cargo layout reading (spec 145 D10/D13/D16, T10)', () => {
  test('ready with the current hash serves that layout, fresh', () => {
    const reading = resolveCargoLayoutReading({
      current: row({ computedAt: FRESH_COMPUTED_AT, layout: FRESH_LAYOUT, status: 'ready' }),
      previousReady: PREVIOUS_READY,
    })

    expect(reading.cargoLayout).toBe(FRESH_LAYOUT)
    expect(reading.cargoLayoutState).toEqual({
      computedAt: FRESH_COMPUTED_AT,
      errorCode: null,
      stale: false,
      status: 'ready',
      truncated: false,
    })
    expect(reading.shouldRequest).toBe(false)
  })

  test('no row for the current hash yet: pending, serving the last ready as stale, and asks', () => {
    const reading = resolveCargoLayoutReading({ current: undefined, previousReady: PREVIOUS_READY })

    expect(reading.cargoLayout).toBe(OLD_LAYOUT)
    expect(reading.cargoLayoutState).toEqual({
      computedAt: OLD_COMPUTED_AT,
      errorCode: null,
      stale: true,
      status: 'pending',
      truncated: false,
    })
    expect(reading.shouldRequest).toBe(true)
  })

  test('nothing ever computed: pending without a layout, not stale', () => {
    const reading = resolveCargoLayoutReading({ current: undefined, previousReady: undefined })

    expect(reading.cargoLayout).toBeNull()
    expect(reading.cargoLayoutState).toEqual({
      computedAt: null,
      errorCode: null,
      stale: false,
      status: 'pending',
      truncated: false,
    })
    expect(reading.shouldRequest).toBe(true)
  })

  test('queued or running within the lease: pending, and the read does not ask again', () => {
    for (const status of ['queued', 'running'] as const) {
      const reading = resolveCargoLayoutReading({
        current: row({ status }),
        previousReady: PREVIOUS_READY,
      })
      expect(reading.cargoLayoutState.status).toBe('pending')
      expect(reading.cargoLayoutState.stale).toBe(true)
      expect(reading.shouldRequest).toBe(false)
    }
  })

  test('queued or running past the lease asks again (D14/D16)', () => {
    for (const status of ['queued', 'running'] as const) {
      const reading = resolveCargoLayoutReading({
        current: row({ leaseExpired: true, status }),
        previousReady: undefined,
      })
      expect(reading.cargoLayoutState.status).toBe('pending')
      expect(reading.shouldRequest).toBe(true)
    }
  })

  test('failed carries its stable code, keeps the last ready as stale, and asks again', () => {
    const reading = resolveCargoLayoutReading({
      current: row({ errorCode: 'CARGO_LAYOUT_FAILED', leaseExpired: false, status: 'failed' }),
      previousReady: PREVIOUS_READY,
    })

    expect(reading.cargoLayout).toBe(OLD_LAYOUT)
    expect(reading.cargoLayoutState).toEqual({
      computedAt: OLD_COMPUTED_AT,
      errorCode: 'CARGO_LAYOUT_FAILED',
      stale: true,
      status: 'failed',
      truncated: false,
    })
    expect(reading.shouldRequest).toBe(true)
  })

  test("the column default '' is served as null, never as an empty code", () => {
    for (const status of ['queued', 'running', 'ready'] as const) {
      const reading = resolveCargoLayoutReading({
        current: row({ errorCode: '', layout: FRESH_LAYOUT, status }),
        previousReady: undefined,
      })
      expect(reading.cargoLayoutState.errorCode).toBeNull()
    }
  })

  test('truncated is derived from time_budget boxes of the served layout (D13)', () => {
    const truncated = resolveCargoLayoutReading({
      current: row({
        computedAt: FRESH_COMPUTED_AT,
        layout: layoutWith(['bedFull', 'time_budget']),
        status: 'ready',
      }),
      previousReady: undefined,
    })
    expect(truncated.cargoLayoutState.truncated).toBe(true)

    const staleTruncated = resolveCargoLayoutReading({
      current: undefined,
      previousReady: { computedAt: OLD_COMPUTED_AT, layout: layoutWith(['time_budget']) },
    })
    expect(staleTruncated.cargoLayoutState.truncated).toBe(true)

    const withoutPlacement = resolveCargoLayoutReading({
      current: row({
        computedAt: FRESH_COMPUTED_AT,
        layout: { placement: null } as unknown as ResolvedCargoLayout,
        status: 'ready',
      }),
      previousReady: undefined,
    })
    expect(withoutPlacement.cargoLayoutState.truncated).toBe(false)
  })

  test('unavailable is a fixed state with nothing to serve', () => {
    expect(UNAVAILABLE_CARGO_LAYOUT_STATE).toEqual({
      computedAt: null,
      errorCode: null,
      stale: false,
      status: 'unavailable',
      truncated: false,
    })
  })
})

/**
 * ⚠️ O validador do frontend (`isCargoLayoutState`, spec 145 T12a) recusa a resposta inteira do
 * detalhe com uma chave a mais ou a menos — e a tela cai com a API respondendo 200 (D17).
 */
describe('cargo layout state shape parity with the frontend validator (spec 145 D17)', () => {
  test('serves exactly the keys the frontend accepts', async () => {
    const source = await readFile(FRONTEND_CONSTANT, 'utf8')
    const frontendKeys = readArrayLiteral(source, 'TRIP_CARGO_LAYOUT_STATE_KEYS')

    expect(frontendKeys.length).toBeGreaterThan(0)
    expect(Object.keys(UNAVAILABLE_CARGO_LAYOUT_STATE).toSorted()).toEqual(frontendKeys.toSorted())
    const reading = resolveCargoLayoutReading({ current: undefined, previousReady: PREVIOUS_READY })
    expect(Object.keys(reading.cargoLayoutState).toSorted()).toEqual(frontendKeys.toSorted())
  })

  test('serves only statuses the frontend knows', async () => {
    const source = await readFile(FRONTEND_TYPES, 'utf8')
    const frontendStatuses = readArrayLiteral(source, 'CARGO_LAYOUT_STATUSES')

    const apiStatuses: readonly string[] = [...CARGO_LAYOUT_READ_STATUSES]
    expect(apiStatuses.toSorted()).toEqual(frontendStatuses.toSorted())
  })
})
