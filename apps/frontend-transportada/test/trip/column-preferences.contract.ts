/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  arrangeTripColumns,
  readTripColumnPreferences,
  reorderTripColumns,
  TRIP_COLUMN_KEYS,
  tripColumnsStorageKey,
  writeTripColumnPreferences,
} from '../../src/modules/trip/shared/tripTable.service'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  }
}

describe('trip table column preferences', () => {
  test('starts with every column visible in the default order', () => {
    const preferences = readTripColumnPreferences({ storage: memoryStorage(), userId: 'u1' })
    expect(preferences.order).toEqual(TRIP_COLUMN_KEYS)
    expect(Object.values(preferences.visibility).every(Boolean)).toBe(true)
  })

  test('saves the layout per user and never leaks to another user', () => {
    const storage = memoryStorage()
    const base = readTripColumnPreferences({ storage, userId: 'u1' })
    writeTripColumnPreferences({
      preferences: {
        order: reorderTripColumns(base.order, 'createdAt', 'up'),
        visibility: { ...base.visibility, occupancy: false },
      },
      storage,
      userId: 'u1',
    })

    const mine = readTripColumnPreferences({ storage, userId: 'u1' })
    expect(mine.visibility.occupancy).toBe(false)
    expect(mine.order.indexOf('createdAt')).toBe(TRIP_COLUMN_KEYS.length - 2)
    expect(storage.data.has(tripColumnsStorageKey('u1'))).toBe(true)

    const other = readTripColumnPreferences({ storage, userId: 'u2' })
    expect(other.order).toEqual(TRIP_COLUMN_KEYS)
    expect(other.visibility.occupancy).toBe(true)
  })

  test('does not read or write without a resolved user', () => {
    const storage = memoryStorage()
    const base = readTripColumnPreferences({ storage, userId: undefined })
    writeTripColumnPreferences({ preferences: base, storage, userId: undefined })
    expect(storage.data.size).toBe(0)
  })

  test('arranges by preference but keeps permission-hidden columns out', () => {
    const base = readTripColumnPreferences({ storage: null, userId: 'u1' })
    const allowed = TRIP_COLUMN_KEYS.filter((column) => column !== 'revenue')
    const arranged = arrangeTripColumns({
      allowed,
      preferences: { ...base, visibility: { ...base.visibility, status: false } },
    })
    expect(arranged).not.toContain('revenue')
    expect(arranged).not.toContain('status')
    expect(arranged).toContain('vehicleId')
  })
})

describe('trip list direction', () => {
  test('asks the server for the previous page only when going backward', async () => {
    const { createTripResponseAdapters } = await import(
      '../../src/modules/trip/shared/tripResponse.validation'
    )
    const adapters = createTripResponseAdapters()
    expect(
      adapters.tripListFromApi({ data: [], page: { nextCursor: null, previousCursor: 'prev' } })
        .previousCursor,
    ).toBe('prev')
    // API antiga, sem o campo: a tela segue funcionando, só sem voltar.
    expect(adapters.tripListFromApi({ data: [], page: { nextCursor: null } }).previousCursor).toBe(
      null,
    )
  })
})

describe('trip page numbers', () => {
  test('counts pages, numbers the current one and jumps by offset', async () => {
    const { tripPageAt, tripPageCount, tripPageNumber } = await import(
      '../../src/modules/trip/shared/tripTable.service'
    )
    expect(tripPageCount({ pageSize: 25, total: null })).toBeNull()
    expect(tripPageCount({ pageSize: 25, total: 0 })).toBe(1)
    expect(tripPageCount({ pageSize: 25, total: 25 })).toBe(1)
    expect(tripPageCount({ pageSize: 25, total: 26 })).toBe(2)
    expect(tripPageNumber({ offset: null, pageSize: 25 })).toBe(1)
    expect(tripPageNumber({ offset: 50, pageSize: 25 })).toBe(3)
    expect(tripPageAt({ pageNumber: 1, pageSize: 25 })).toEqual({
      cursor: null,
      direction: 'forward',
      offset: null,
    })
    expect(tripPageAt({ pageNumber: 4, pageSize: 50 })).toEqual({
      cursor: null,
      direction: 'forward',
      offset: 150,
    })
  })

  test('shows every page up to seven and elides the middle beyond that', async () => {
    const { visibleTripPageNumbers } = await import(
      '../../src/modules/trip/shared/tripTable.service'
    )
    expect(visibleTripPageNumbers({ count: 1, current: 1 })).toEqual([1])
    expect(visibleTripPageNumbers({ count: 7, current: 4 })).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(visibleTripPageNumbers({ count: 20, current: 1 })).toEqual([1, 2, 'gap', 20])
    expect(visibleTripPageNumbers({ count: 20, current: 10 })).toEqual([
      1,
      'gap',
      9,
      10,
      11,
      'gap',
      20,
    ])
    expect(visibleTripPageNumbers({ count: 20, current: 3 })).toEqual([1, 2, 3, 4, 'gap', 20])
    expect(visibleTripPageNumbers({ count: 20, current: 20 })).toEqual([1, 'gap', 19, 20])
  })
})
