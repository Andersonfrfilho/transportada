/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, sql } from 'drizzle-orm'

import { nfeDistributionCursors } from '../src/database/nfe.schema.js'
import { DrizzleNfeDistributionCursorRepository } from '../src/nfe-distribution/infrastructure/drizzle-nfe-distribution-cursor.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const ENVIRONMENT = 'homologation' as const
const LEASE_MS = 30_000

describeDatabase('DrizzleNfeDistributionCursorRepository (integration)', () => {
  const companyId = crypto.randomUUID()
  const otherCompanyId = crypto.randomUUID()

  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const db = provider.db
  const repository = new DrizzleNfeDistributionCursorRepository(db)

  beforeAll(async () => {
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await db.execute(sql`insert into companies (id, status) values (${otherCompanyId}, 'active')`)
  })

  afterAll(async () => {
    await db.delete(nfeDistributionCursors).where(eq(nfeDistributionCursors.companyId, companyId))
    await db
      .delete(nfeDistributionCursors)
      .where(eq(nfeDistributionCursors.companyId, otherCompanyId))
    await db.execute(sql`delete from companies where id = ${companyId}`)
    await db.execute(sql`delete from companies where id = ${otherCompanyId}`)
    await provider.close()
  })

  it('creates the cursor on first acquireLease with default NSUs and marks the lease', async () => {
    const now = new Date('2026-07-25T12:00:00.000Z')

    const record = await repository.acquireLease({
      companyId,
      environment: ENVIRONMENT,
      leaseMs: LEASE_MS,
      now,
      owner: 'worker-a',
    })

    expect(record).not.toBeNull()
    expect(record?.ultNsu).toBe('000000000000000')
    expect(record?.maxNsu).toBe('000000000000000')
    expect(record?.leaseOwner).toBe('worker-a')
    expect(record?.leaseExpiresAt?.getTime()).toBe(now.getTime() + LEASE_MS)

    const [row] = await db
      .select()
      .from(nfeDistributionCursors)
      .where(
        and(
          eq(nfeDistributionCursors.companyId, companyId),
          eq(nfeDistributionCursors.environment, ENVIRONMENT),
        ),
      )
    expect(row?.leaseOwner).toBe('worker-a')
  })

  it('returns null when a valid lease is held by another owner', async () => {
    const now = new Date('2026-07-25T12:00:10.000Z')

    const record = await repository.acquireLease({
      companyId,
      environment: ENVIRONMENT,
      leaseMs: LEASE_MS,
      now,
      owner: 'worker-b',
    })

    expect(record).toBeNull()
  })

  it('persists the advanced cursor and next-allowed window via saveCursor', async () => {
    const nextAllowedAt = new Date('2026-07-25T13:00:00.000Z')

    await repository.saveCursor({
      companyId,
      environment: ENVIRONMENT,
      maxNsu: '000000000000120',
      nextAllowedAt,
      owner: 'worker-a',
      ultNsu: '000000000000090',
    })

    const [row] = await db
      .select()
      .from(nfeDistributionCursors)
      .where(
        and(
          eq(nfeDistributionCursors.companyId, companyId),
          eq(nfeDistributionCursors.environment, ENVIRONMENT),
        ),
      )
    expect(row?.ultNsu).toBe('000000000000090')
    expect(row?.maxNsu).toBe('000000000000120')
    expect(row?.nextAllowedAt?.getTime()).toBe(nextAllowedAt.getTime())
  })

  it('clears the lease on releaseLease so another worker can acquire', async () => {
    await repository.releaseLease({ companyId, environment: ENVIRONMENT, owner: 'worker-a' })

    const [released] = await db
      .select()
      .from(nfeDistributionCursors)
      .where(
        and(
          eq(nfeDistributionCursors.companyId, companyId),
          eq(nfeDistributionCursors.environment, ENVIRONMENT),
        ),
      )
    expect(released?.leaseOwner).toBeNull()
    expect(released?.leaseExpiresAt).toBeNull()

    const now = new Date('2026-07-25T12:05:00.000Z')
    const record = await repository.acquireLease({
      companyId,
      environment: ENVIRONMENT,
      leaseMs: LEASE_MS,
      now,
      owner: 'worker-c',
    })
    expect(record).not.toBeNull()
    expect(record?.leaseOwner).toBe('worker-c')
    expect(record?.ultNsu).toBe('000000000000090')
    expect(record?.maxNsu).toBe('000000000000120')
    await repository.releaseLease({ companyId, environment: ENVIRONMENT, owner: 'worker-c' })
  })

  it('steals an expired lease', async () => {
    const acquiredAt = new Date('2026-07-25T14:00:00.000Z')
    await repository.acquireLease({
      companyId,
      environment: ENVIRONMENT,
      leaseMs: LEASE_MS,
      now: acquiredAt,
      owner: 'worker-stale',
    })

    const afterExpiry = new Date(acquiredAt.getTime() + LEASE_MS + 1_000)
    const record = await repository.acquireLease({
      companyId,
      environment: ENVIRONMENT,
      leaseMs: LEASE_MS,
      now: afterExpiry,
      owner: 'worker-fresh',
    })

    expect(record).not.toBeNull()
    expect(record?.leaseOwner).toBe('worker-fresh')
    await repository.releaseLease({ companyId, environment: ENVIRONMENT, owner: 'worker-fresh' })
  })

  it('keeps cursors isolated per tenant', async () => {
    const now = new Date('2026-07-25T15:00:00.000Z')

    const record = await repository.acquireLease({
      companyId: otherCompanyId,
      environment: ENVIRONMENT,
      leaseMs: LEASE_MS,
      now,
      owner: 'worker-a',
    })

    expect(record).not.toBeNull()
    expect(record?.ultNsu).toBe('000000000000000')
    expect(record?.maxNsu).toBe('000000000000000')
    await repository.releaseLease({
      companyId: otherCompanyId,
      environment: ENVIRONMENT,
      owner: 'worker-a',
    })
  })
})
