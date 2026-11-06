/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, describe, expect, it } from 'bun:test'

import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'

import {
  nfeAccessKeyLookupBudgets,
  nfeAccessKeyLookups,
  nfeImports,
} from '../src/database/nfe.schema.js'
import { processingOutbox } from '../src/database/processing.schema.js'
import { createDrizzleAccessKeyLookupRequeue } from '../src/nfe-access-key-lookup/infrastructure/drizzle-access-key-lookup-requeue.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const NOW = new Date('2026-11-06T12:00:00.000Z')
const MINUTE_MS = 60 * 1000
const ACCESS_KEY_PREFIX = '3519073029085600016055001000000'

describeDatabase('access key lookup requeue (integration)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const db = provider.db
  const requeue = createDrizzleAccessKeyLookupRequeue({ database: db })
  const companyIds: string[] = []
  const userIds: string[] = []
  let keyCounter = 0

  async function createCompany(): Promise<{ companyId: string; userId: string }> {
    const companyId = crypto.randomUUID()
    const userId = crypto.randomUUID()
    companyIds.push(companyId)
    userIds.push(userId)
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(sql`insert into identity_users (id, status) values (${userId}, 'active')`)
    await db.execute(
      sql`insert into user_company_memberships (id, user_id, company_id, status)
          values (${crypto.randomUUID()}, ${userId}, ${companyId}, 'active')`,
    )
    return { companyId, userId }
  }

  async function seedWaiting(params: {
    readonly companyId: string
    readonly createdMinutesAgo: number
    readonly hasImport?: boolean
    readonly notBeforeOffsetMinutes?: number
    readonly userId: string
  }): Promise<string> {
    keyCounter += 1
    const keyNumber = keyCounter
    const lookupId = crypto.randomUUID()
    const importId = crypto.randomUUID()
    if (params.hasImport !== false) {
      await db.insert(nfeImports).values({
        companyId: params.companyId,
        correlationId: `corr-${importId}`,
        id: importId,
        idempotencyKey: `idem-${importId}`,
        requestFingerprint: `fingerprint-${importId}`,
        requestedByUserId: params.userId,
        source: 'access_key',
        status: 'queued',
      })
    }
    await db.insert(nfeAccessKeyLookups).values({
      accessKey: `${ACCESS_KEY_PREFIX}${String(keyNumber).padStart(13, '0')}`,
      companyId: params.companyId,
      correlationId: `corr-${lookupId}`,
      createdAt: new Date(NOW.getTime() - params.createdMinutesAgo * MINUTE_MS),
      environment: 'production',
      id: lookupId,
      importId: params.hasImport === false ? null : importId,
      notBefore: new Date(NOW.getTime() + (params.notBeforeOffsetMinutes ?? -1) * MINUTE_MS),
      requestedByUserId: params.userId,
      status: 'waiting',
    })
    return lookupId
  }

  async function statusOf(lookupId: string): Promise<string> {
    const [row] = await db
      .select({ status: nfeAccessKeyLookups.status })
      .from(nfeAccessKeyLookups)
      .where(eq(nfeAccessKeyLookups.id, lookupId))
    return row!.status
  }

  async function eventsOf(companyId: string) {
    return db
      .select()
      .from(processingOutbox)
      .where(
        and(
          eq(processingOutbox.companyId, companyId),
          eq(processingOutbox.eventType, 'transportada.nfe.access-key.requested'),
        ),
      )
      .orderBy(asc(processingOutbox.createdAt))
  }

  afterAll(async () => {
    await db.delete(processingOutbox).where(inArray(processingOutbox.companyId, companyIds))
    await db.delete(nfeAccessKeyLookups).where(inArray(nfeAccessKeyLookups.companyId, companyIds))
    await db
      .delete(nfeAccessKeyLookupBudgets)
      .where(inArray(nfeAccessKeyLookupBudgets.companyId, companyIds))
    await db.delete(nfeImports).where(inArray(nfeImports.companyId, companyIds))
    for (const companyId of companyIds) {
      await db.execute(sql`delete from user_company_memberships where company_id = ${companyId}`)
      await db.execute(sql`delete from companies where id = ${companyId}`)
    }
    for (const userId of userIds) {
      await db.execute(sql`delete from identity_users where id = ${userId}`)
    }
    await provider.close()
  })

  it('requeues a due waiting lookup with a fresh outbox event carrying the same reference', async () => {
    const { companyId, userId } = await createCompany()
    const lookupId = await seedWaiting({ companyId, createdMinutesAgo: 30, userId })

    await expect(requeue.requeueDueLookups({ now: NOW })).resolves.toMatchObject({
      requeuedCount: expect.any(Number),
    })

    expect(await statusOf(lookupId)).toBe('queued')
    const [lookup] = await db
      .select()
      .from(nfeAccessKeyLookups)
      .where(eq(nfeAccessKeyLookups.id, lookupId))
    expect(lookup?.notBefore).toBeNull()
    const events = await eventsOf(companyId)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      actorUserId: userId,
      aggregateId: lookup!.importId,
      aggregateType: 'nfe_import',
      eventVersion: 1n,
      publishedAt: null,
      triggeredBy: 'user',
    })
    expect(events[0]?.payload).toEqual({ companyId, importId: lookup!.importId, lookupId })
  })

  it('leaves lookups that are not due, have no import, or are already queued alone', async () => {
    const { companyId, userId } = await createCompany()
    const future = await seedWaiting({
      companyId,
      createdMinutesAgo: 30,
      notBeforeOffsetMinutes: 10,
      userId,
    })
    const withoutImport = await seedWaiting({
      companyId,
      createdMinutesAgo: 20,
      hasImport: false,
      userId,
    })

    await requeue.requeueDueLookups({ now: NOW })

    expect(await statusOf(future)).toBe('waiting')
    expect(await statusOf(withoutImport)).toBe('waiting')
    expect(await eventsOf(companyId)).toHaveLength(0)
  })

  it('requeues only what fits in the remaining budget, oldest first, without spending it', async () => {
    const { companyId, userId } = await createCompany()
    await db.insert(nfeAccessKeyLookupBudgets).values({
      companyId,
      environment: 'production',
      usedInWindow: 13,
      windowStartedAt: new Date(NOW.getTime() - 10 * MINUTE_MS),
    })
    const oldest = await seedWaiting({ companyId, createdMinutesAgo: 50, userId })
    const middle = await seedWaiting({ companyId, createdMinutesAgo: 40, userId })
    const newest = await seedWaiting({ companyId, createdMinutesAgo: 30, userId })

    await requeue.requeueDueLookups({ now: NOW })

    expect([await statusOf(oldest), await statusOf(middle), await statusOf(newest)]).toEqual([
      'queued',
      'queued',
      'waiting',
    ])
    expect(await eventsOf(companyId)).toHaveLength(2)
    const [budget] = await db
      .select()
      .from(nfeAccessKeyLookupBudgets)
      .where(eq(nfeAccessKeyLookupBudgets.companyId, companyId))
    expect(budget?.usedInWindow).toBe(13)
  })

  it('requeues nothing while the 656 block is open', async () => {
    const { companyId, userId } = await createCompany()
    await db.insert(nfeAccessKeyLookupBudgets).values({
      blockedUntil: new Date(NOW.getTime() + 30 * MINUTE_MS),
      companyId,
      environment: 'production',
      usedInWindow: 0,
      windowStartedAt: new Date(NOW.getTime() - 5 * MINUTE_MS),
    })
    const lookupId = await seedWaiting({ companyId, createdMinutesAgo: 30, userId })

    await requeue.requeueDueLookups({ now: NOW })

    expect(await statusOf(lookupId)).toBe('waiting')
    expect(await eventsOf(companyId)).toHaveLength(0)
  })

  it('two concurrent workers never enqueue the same lookup twice', async () => {
    const { companyId, userId } = await createCompany()
    const lookupIds = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        seedWaiting({ companyId, createdMinutesAgo: 60 - index, userId }),
      ),
    )

    const results = await Promise.all([
      requeue.requeueDueLookups({ now: NOW }),
      requeue.requeueDueLookups({ now: NOW }),
      requeue.requeueDueLookups({ now: NOW }),
    ])

    expect(results.reduce((total, result) => total + result.requeuedCount, 0)).toBe(8)
    const events = await eventsOf(companyId)
    expect(events).toHaveLength(8)
    expect(
      new Set(events.map((event) => (event.payload as { lookupId: string }).lookupId)),
    ).toEqual(new Set(lookupIds))
  })

  it('counts lookups already queued as spent, so a later cycle never re-offers the same budget', async () => {
    const { companyId, userId } = await createCompany()
    await Promise.all(
      Array.from({ length: 20 }, (_, index) =>
        seedWaiting({ companyId, createdMinutesAgo: 60 - index, userId }),
      ),
    )

    const first = await requeue.requeueDueLookups({ now: NOW })
    const newcomers = await Promise.all(
      Array.from({ length: 5 }, () => seedWaiting({ companyId, createdMinutesAgo: 1, userId })),
    )
    const second = await requeue.requeueDueLookups({ now: NOW })

    expect(first.requeuedCount).toBe(15)
    expect(second.requeuedCount).toBe(0)
    expect(await Promise.all(newcomers.map(statusOf))).toEqual(Array(5).fill('waiting'))
    expect(await eventsOf(companyId)).toHaveLength(15)
  })

  it('concurrent requeues never exceed the remaining budget of the scope', async () => {
    const { companyId, userId } = await createCompany()
    await db.insert(nfeAccessKeyLookupBudgets).values({
      companyId,
      environment: 'production',
      usedInWindow: 9,
      windowStartedAt: new Date(NOW.getTime() - 10 * MINUTE_MS),
    })
    await Promise.all(
      Array.from({ length: 30 }, (_, index) =>
        seedWaiting({ companyId, createdMinutesAgo: 60 - index, userId }),
      ),
    )

    const results = await Promise.all([
      requeue.requeueDueLookups({ now: NOW }),
      requeue.requeueDueLookups({ now: NOW }),
      requeue.requeueDueLookups({ now: NOW }),
    ])

    expect(results.reduce((total, result) => total + result.requeuedCount, 0)).toBe(6)
    expect(await eventsOf(companyId)).toHaveLength(6)
  })
})
