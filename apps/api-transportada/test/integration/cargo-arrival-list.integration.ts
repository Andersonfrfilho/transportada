/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 (revisão das Fases 1–2, M3): o filtro de vários contratantes e a ordenação valem na lista
 * inteira, não só na página carregada. Pagina-se até o fim e compara-se com a ordem calculada à parte,
 * com desempate por id e o "sem prazo" sempre por último.
 */
import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { cargoArrivals, contractors } from '../../src/database/database.schema.js'
import {
  hasTestDatabase,
  withCargoDatabase,
  type TestDatabase,
} from '../fixtures/cargo-arrival-database.fixture.js'
import {
  callCargoArrival,
  createCargoArrivalHandler,
  type CargoArrivalHandle,
} from '../fixtures/cargo-arrival-http.fixture.js'
import { COMPANY_CONTEXT, jsonRequest } from '../fixtures/freight-region-http.fixture.js'

const testWithPostgres = hasTestDatabase ? test : test.skip
const HOUR_MS = 3_600_000
const BASE = Date.parse('2026-10-05T12:00:00.000Z')
const STATUS_RANK: Readonly<Record<string, number>> = { closed: 1, open: 0 }

type Row = {
  readonly arrivedAt: string
  readonly contractorId: string
  readonly contractorName: string
  readonly id: string
  readonly separationDueAt: string | null
  readonly status: string
}

/** Contratante, horas antes da base, janela e situação — duas chegadas no mesmo instante. */
const PLAN = [
  ['first', 1, 24, 'open'],
  ['first', 2, null, 'closed'],
  ['first', 3, 4, 'open'],
  ['second', 1, 48, 'closed'],
  ['second', 5, null, 'open'],
  ['third', 6, 24, 'open'],
  ['third', 7, null, 'closed'],
] as const

async function seedArrivals(
  database: TestDatabase,
  owners: Readonly<Record<'first' | 'second' | 'third', string>>,
): Promise<void> {
  await database.db.insert(cargoArrivals).values(
    PLAN.map(([owner, hoursBefore, window, status], index) => {
      const arrivedAt = new Date(BASE - hoursBefore * HOUR_MS)
      return {
        arrivedAt,
        channel: 'backoffice' as const,
        companyId: COMPANY_CONTEXT.companyId,
        contractorId: owners[owner],
        idempotencyKey: `arrival-list-key-${String(index).padStart(4, '0')}`,
        registeredByUserId: COMPANY_CONTEXT.userId,
        requestFingerprint: String(index).repeat(64).slice(0, 64),
        separationDueAt: window === null ? null : new Date(arrivedAt.getTime() + window * HOUR_MS),
        separationWindowHours: window,
        status,
      }
    }),
  )
}

async function readAll(handle: CargoArrivalHandle, query: string): Promise<Row[]> {
  const rows: Row[] = []
  let cursor: string | null = null
  for (let page = 0; page < 20; page += 1) {
    const suffix = cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`
    const response = await callCargoArrival(
      handle,
      jsonRequest({ method: 'GET', path: `/cargo-arrivals?limit=2&${query}${suffix}` }),
    )
    expect(response.status).toBe(200)
    rows.push(...(response.body.data as unknown as Row[]))
    cursor = response.body.nextCursor ?? null
    if (cursor === null) return rows
  }
  throw new Error('THE_CURSOR_NEVER_ENDED')
}

function sortKey(row: Row, sort: string): number | string | null {
  if (sort === 'arrivedAt') return Date.parse(row.arrivedAt)
  if (sort === 'separationDueAt')
    return row.separationDueAt === null ? null : Date.parse(row.separationDueAt)
  if (sort === 'status') return STATUS_RANK[row.status] ?? null
  return row.contractorName
}

function expectedOrder(rows: readonly Row[], sort: string, direction: string): string[] {
  const sign = direction === 'asc' ? 1 : -1
  return rows
    .toSorted((left, right) => {
      const [a, b] = [sortKey(left, sort), sortKey(right, sort)]
      if (a === null || b === null) {
        if (a !== b) return a === null ? 1 : -1
      } else if (a !== b) return (a < b ? -1 : 1) * sign
      return (left.id < right.id ? -1 : 1) * sign
    })
    .map((row) => row.id)
}

describe('a lista de chegadas inteira, filtrada e ordenada no servidor (spec 237, M3)', () => {
  testWithPostgres('dois contratantes além da primeira página e cada ordenação', async () => {
    await withCargoDatabase(async (database, tenants) => {
      const third = crypto.randomUUID()
      await database.db.insert(contractors).values({
        companyId: COMPANY_CONTEXT.companyId,
        displayName: 'Charlie Cargas',
        id: third,
        taxId: '11444777000161',
      })
      await database.db
        .update(contractors)
        .set({ displayName: 'Bravo Embarques' })
        .where(eq(contractors.id, tenants.contractorId))
      await database.db
        .update(contractors)
        .set({ displayName: 'Alfa Transportes' })
        .where(eq(contractors.id, tenants.otherContractorId))
      await seedArrivals(database, {
        first: tenants.contractorId,
        second: tenants.otherContractorId,
        third,
      })
      const handle = createCargoArrivalHandler({ database })
      const everything = await readAll(handle, 'sort=arrivedAt&direction=desc')
      expect(everything).toHaveLength(PLAN.length)

      const filtered = await readAll(
        handle,
        `contractorId=${tenants.contractorId}&contractorId=${tenants.otherContractorId}`,
      )
      const owners = new Set([tenants.contractorId, tenants.otherContractorId])
      expect(filtered.map((row) => row.id)).toEqual(
        expectedOrder(
          everything.filter((row) => owners.has(row.contractorId)),
          'arrivedAt',
          'desc',
        ),
      )
      const closedOfTwo = await readAll(
        handle,
        `contractorId=${tenants.contractorId}&contractorId=${third}&status=closed`,
      )
      expect(closedOfTwo.map((row) => [row.contractorId, row.status])).toEqual([
        [tenants.contractorId, 'closed'],
        [third, 'closed'],
      ])

      for (const sort of ['arrivedAt', 'contractorName', 'separationDueAt', 'status']) {
        for (const direction of ['asc', 'desc']) {
          const sorted = await readAll(handle, `sort=${sort}&direction=${direction}`)
          expect({ direction, ids: sorted.map((row) => row.id), sort }).toEqual({
            direction,
            ids: expectedOrder(everything, sort, direction),
            sort,
          })
        }
      }

      const first = await callCargoArrival(
        handle,
        jsonRequest({ method: 'GET', path: '/cargo-arrivals?limit=2&sort=status&direction=asc' }),
      )
      const swapped = await callCargoArrival(
        handle,
        jsonRequest({
          method: 'GET',
          path: `/cargo-arrivals?limit=2&sort=status&direction=desc&cursor=${encodeURIComponent(
            first.body.nextCursor ?? '',
          )}`,
        }),
      )
      expect(swapped).toMatchObject({
        body: { error: { code: 'CARGO_ARRIVAL_CURSOR_ORDER_MISMATCH' } },
        status: 400,
      })
    })
  })
})
