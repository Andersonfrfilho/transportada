/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq, sql } from 'drizzle-orm'

import { nfeAccessKeyLookupBudgets } from '../src/database/nfe.schema.js'
import { DrizzleAccessKeyLookupBudgetRepository } from '../src/nfe-access-key-lookup/infrastructure/drizzle-access-key-lookup-budget.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

const ENVIRONMENT = 'homologation' as const
const HOUR_MS = 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
const START = new Date('2026-11-06T12:00:00.000Z')

describeDatabase('DrizzleAccessKeyLookupBudgetRepository (integration)', () => {
  const companyIds: string[] = []
  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const db = provider.db
  const repository = new DrizzleAccessKeyLookupBudgetRepository(db)

  async function createCompany(): Promise<string> {
    const companyId = crypto.randomUUID()
    companyIds.push(companyId)
    await db.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    return companyId
  }

  async function reserveMany(companyId: string, count: number, now = START): Promise<void> {
    for (let index = 0; index < count; index += 1) {
      const result = await repository.reserve({ companyId, environment: ENVIRONMENT, now })
      expect(result.reserved).toBe(true)
    }
  }

  afterAll(async () => {
    for (const companyId of companyIds) {
      await db
        .delete(nfeAccessKeyLookupBudgets)
        .where(eq(nfeAccessKeyLookupBudgets.companyId, companyId))
      await db.execute(sql`delete from companies where id = ${companyId}`)
    }
    await provider.close()
  })

  it('counts down the budget and refuses the 16th with notBefore at the window end', async () => {
    const companyId = await createCompany()

    const first = await repository.reserve({ companyId, environment: ENVIRONMENT, now: START })
    expect(first).toEqual({ reserved: true, budgetLeft: 14 })
    await reserveMany(companyId, 14)

    const refused = await repository.reserve({
      companyId,
      environment: ENVIRONMENT,
      now: new Date(START.getTime() + 10 * MINUTE_MS),
    })
    expect(refused).toEqual({ reserved: false, notBefore: new Date(START.getTime() + HOUR_MS) })
  })

  it('resets the window once it is one hour old', async () => {
    const companyId = await createCompany()
    await reserveMany(companyId, 15)

    const afterWindow = new Date(START.getTime() + HOUR_MS)
    const result = await repository.reserve({
      companyId,
      environment: ENVIRONMENT,
      now: afterWindow,
    })

    expect(result).toEqual({ reserved: true, budgetLeft: 14 })
  })

  it('lets exactly one of two concurrent reservations take the last slot', async () => {
    const companyId = await createCompany()
    await reserveMany(companyId, 14)

    const results = await Promise.all([
      repository.reserve({ companyId, environment: ENVIRONMENT, now: START }),
      repository.reserve({ companyId, environment: ENVIRONMENT, now: START }),
    ])

    expect(results.filter((result) => result.reserved)).toHaveLength(1)
    expect(results.filter((result) => !result.reserved)).toHaveLength(1)
    const [row] = await db
      .select()
      .from(nfeAccessKeyLookupBudgets)
      .where(eq(nfeAccessKeyLookupBudgets.companyId, companyId))
    expect(row?.usedInWindow).toBe(15)
  })

  it('never exceeds the limit under heavy concurrency', async () => {
    const companyId = await createCompany()

    const results = await Promise.all(
      Array.from({ length: 40 }, () =>
        repository.reserve({ companyId, environment: ENVIRONMENT, now: START }),
      ),
    )

    expect(results.filter((result) => result.reserved)).toHaveLength(15)
  })

  it('a 656 block refuses for 65 minutes and the window does not reset during it', async () => {
    const companyId = await createCompany()
    await reserveMany(companyId, 3)
    await repository.block656({ companyId, environment: ENVIRONMENT, now: START })
    const blockedUntil = new Date(START.getTime() + 65 * MINUTE_MS)

    const duringWindow = await repository.reserve({
      companyId,
      environment: ENVIRONMENT,
      now: new Date(START.getTime() + 30 * MINUTE_MS),
    })
    expect(duringWindow).toEqual({ reserved: false, notBefore: blockedUntil })

    const windowExpiredButBlocked = await repository.reserve({
      companyId,
      environment: ENVIRONMENT,
      now: new Date(START.getTime() + 62 * MINUTE_MS),
    })
    expect(windowExpiredButBlocked).toEqual({ reserved: false, notBefore: blockedUntil })

    const afterBlock = await repository.reserve({
      companyId,
      environment: ENVIRONMENT,
      now: blockedUntil,
    })
    expect(afterBlock).toEqual({ reserved: true, budgetLeft: 14 })
  })

  it('block656 on a company without a row creates the block', async () => {
    const companyId = await createCompany()
    await repository.block656({ companyId, environment: ENVIRONMENT, now: START })

    const refused = await repository.reserve({
      companyId,
      environment: ENVIRONMENT,
      now: new Date(START.getTime() + MINUTE_MS),
    })

    expect(refused).toEqual({
      reserved: false,
      notBefore: new Date(START.getTime() + 65 * MINUTE_MS),
    })
  })

  it('keeps budgets separate per company and environment', async () => {
    const companyId = await createCompany()
    const otherCompanyId = await createCompany()
    await reserveMany(companyId, 15)

    const otherCompany = await repository.reserve({
      companyId: otherCompanyId,
      environment: ENVIRONMENT,
      now: START,
    })
    const otherEnvironment = await repository.reserve({
      companyId,
      environment: 'production',
      now: START,
    })

    expect(otherCompany).toEqual({ reserved: true, budgetLeft: 14 })
    expect(otherEnvironment).toEqual({ reserved: true, budgetLeft: 14 })
  })
})
