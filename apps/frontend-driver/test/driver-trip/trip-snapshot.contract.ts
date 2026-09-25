/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'bun:test'

import type { DriverTripSnapshot } from '@/modules/driver-trip/shared/driverTrip.types'
import {
  claimTripSnapshot,
  discardTripSnapshots,
  hashSubject,
  isStoredTripSnapshot,
  readLastTripSnapshot,
  saveTripSnapshot,
  TRIP_SNAPSHOT_MAX_AGE_MS,
  type StoredTripSnapshot,
  type TripSnapshotStore,
} from '@/modules/driver-trip/shared/tripSnapshot.service'

const NOW = new Date('2026-09-25T12:00:00.000Z')
const HOUR_MS = 60 * 60 * 1000
const INDEXED_DB = new URL(
  '../../src/modules/driver-trip/shared/indexedDbQueue.service.ts',
  import.meta.url,
)
const PROFILE = new URL(
  '../../src/modules/driver-trip/pages/DriverProfile.page.tsx',
  import.meta.url,
)

function snapshotWith(statuses: readonly string[]): DriverTripSnapshot {
  return {
    isRegisteredDriver: true,
    pendingProofs: [],
    score: null,
    trips: statuses.map((status, index) => ({
      id: `trip-${index}`,
      manifest: null,
      status,
      stops: [],
      vehiclePlate: 'ABC1D23',
    })),
  }
}

function hoursBefore(hours: number): Date {
  return new Date(NOW.getTime() - hours * HOUR_MS)
}

/** O mesmo formato do IndexedDB: um registro por `subHash` e o ponteiro `last`. */
function createMemorySnapshotStore(): TripSnapshotStore & {
  readonly owners: () => readonly string[]
  readonly last: () => string | undefined
} {
  const records = new Map<string, StoredTripSnapshot>()
  let lastOwner: string | undefined

  return {
    clear: () => {
      records.clear()
      lastOwner = undefined
      return Promise.resolve()
    },
    last: () => lastOwner,
    owners: () => [...records.keys()],
    read: (subHash) => Promise.resolve(records.get(subHash)),
    readLastOwner: () => Promise.resolve(lastOwner),
    remove: (subHash) => {
      records.delete(subHash)
      return Promise.resolve()
    },
    retainOnly: (subHash) => {
      for (const owner of [...records.keys()]) if (owner !== subHash) records.delete(owner)
      lastOwner = subHash
      return Promise.resolve()
    },
    write: ({ record, subHash }) => {
      records.set(subHash, record)
      lastOwner = subHash
      return Promise.resolve()
    },
  }
}

describe('o dono do snapshot (plan D5, ADR-0075 §8)', () => {
  it('subHash é SHA-256 do sub, em hex — o sub nunca é gravado', async () => {
    expect(await hashSubject('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    expect(await hashSubject('abc')).toHaveLength(64)
    expect(await hashSubject('outro-usuario')).not.toBe(await hashSubject('abc'))
  })

  it('grava com a hora e aponta o último usuário para o boot sem rede', async () => {
    const store = createMemorySnapshotStore()
    const subHash = await hashSubject('motorista-1')

    await saveTripSnapshot({ now: NOW, snapshot: snapshotWith(['in_transit']), store, subHash })

    const last = await readLastTripSnapshot({ now: NOW, store })
    expect(last?.subHash).toBe(subHash)
    expect(last?.savedAt).toBe(NOW.toISOString())
    expect(last?.snapshot.trips[0]?.status).toBe('in_transit')
  })

  it('outro sub autentica: o snapshot do anterior é descartado', async () => {
    const store = createMemorySnapshotStore()
    const previous = await hashSubject('motorista-1')
    const next = await hashSubject('motorista-2')
    await saveTripSnapshot({
      now: hoursBefore(1),
      snapshot: snapshotWith(['in_transit']),
      store,
      subHash: previous,
    })

    const claimed = await claimTripSnapshot({ now: NOW, store, subHash: next })

    expect(claimed).toBeUndefined()
    expect(store.owners()).toEqual([])
    expect(store.last()).toBe(next)
    expect(await readLastTripSnapshot({ now: NOW, store })).toBeUndefined()
  })

  it('o mesmo sub autentica: o snapshot dele segue e vira o dado inicial', async () => {
    const store = createMemorySnapshotStore()
    const subHash = await hashSubject('motorista-1')
    await saveTripSnapshot({
      now: hoursBefore(2),
      snapshot: snapshotWith(['on_delivery_route']),
      store,
      subHash,
    })

    const claimed = await claimTripSnapshot({ now: NOW, store, subHash })

    expect(claimed?.savedAt).toBe(hoursBefore(2).toISOString())
    expect(store.owners()).toEqual([subHash])
  })

  it('depois de 24 h, descartado — na leitura e no claim', async () => {
    const store = createMemorySnapshotStore()
    const subHash = await hashSubject('motorista-1')
    await saveTripSnapshot({
      now: new Date(NOW.getTime() - TRIP_SNAPSHOT_MAX_AGE_MS - 1),
      snapshot: snapshotWith(['in_transit']),
      store,
      subHash,
    })

    expect(TRIP_SNAPSHOT_MAX_AGE_MS).toBe(24 * HOUR_MS)
    expect(await readLastTripSnapshot({ now: NOW, store })).toBeUndefined()
    expect(store.owners()).toEqual([])

    await saveTripSnapshot({
      now: new Date(NOW.getTime() - TRIP_SNAPSHOT_MAX_AGE_MS - 1),
      snapshot: snapshotWith(['in_transit']),
      store,
      subHash,
    })
    expect(await claimTripSnapshot({ now: NOW, store, subHash })).toBeUndefined()
    expect(store.owners()).toEqual([])
  })

  it('com todas as viagens concluídas (ou nenhuma), a gravação apaga em vez de guardar', async () => {
    const store = createMemorySnapshotStore()
    const subHash = await hashSubject('motorista-1')
    await saveTripSnapshot({ now: NOW, snapshot: snapshotWith(['in_transit']), store, subHash })

    await saveTripSnapshot({
      now: NOW,
      snapshot: snapshotWith(['completed', 'cancelled']),
      store,
      subHash,
    })
    expect(store.owners()).toEqual([])

    await saveTripSnapshot({ now: NOW, snapshot: snapshotWith([]), store, subHash })
    expect(store.owners()).toEqual([])
  })

  it('uma viagem ainda aberta basta para guardar', async () => {
    const store = createMemorySnapshotStore()
    const subHash = await hashSubject('motorista-1')

    await saveTripSnapshot({
      now: NOW,
      snapshot: snapshotWith(['completed', 'on_delivery_route']),
      store,
      subHash,
    })

    expect(store.owners()).toEqual([subHash])
  })

  it('"Sair" descarta tudo, inclusive o ponteiro', async () => {
    const store = createMemorySnapshotStore()
    const subHash = await hashSubject('motorista-1')
    await saveTripSnapshot({ now: NOW, snapshot: snapshotWith(['in_transit']), store, subHash })

    await discardTripSnapshots({ store })

    expect(store.owners()).toEqual([])
    expect(store.last()).toBeUndefined()
    expect(await readLastTripSnapshot({ now: NOW, store })).toBeUndefined()
  })

  it('o que volta do IndexedDB é validado antes de virar snapshot', () => {
    expect(
      isStoredTripSnapshot({ savedAt: NOW.toISOString(), snapshot: snapshotWith(['in_transit']) }),
    ).toBe(true)
    expect(isStoredTripSnapshot(undefined)).toBe(false)
    expect(isStoredTripSnapshot({ savedAt: NOW.toISOString() })).toBe(false)
    expect(isStoredTripSnapshot({ savedAt: 1, snapshot: snapshotWith([]) })).toBe(false)
    expect(isStoredTripSnapshot({ savedAt: NOW.toISOString(), snapshot: { trips: 'x' } })).toBe(
      false,
    )
  })
})

describe('o store trip-snapshot no IndexedDB (plan D5)', () => {
  const source = readFileSync(INDEXED_DB, 'utf8')

  it('a base nasce na versão 3, com o store do snapshot e o ponteiro last', () => {
    expect(source).toInclude('const DATABASE_VERSION = 3')
    expect(source).toInclude("const TRIP_SNAPSHOT_STORE_NAME = 'trip-snapshot'")
    expect(source).toInclude("const LAST_OWNER_KEY = 'last'")
    expect(source).toInclude('export function createIndexedDbTripSnapshotStore()')
  })

  it('"Sair" descarta o snapshot antes do logout', () => {
    const profile = readFileSync(PROFILE, 'utf8')
    const discardIndex = profile.indexOf('discardTripSnapshots(')

    expect(discardIndex).toBeGreaterThan(-1)
    expect(discardIndex).toBeLessThan(profile.indexOf('.logout()'))
  })
})
