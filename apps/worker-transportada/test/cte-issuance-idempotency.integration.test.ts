/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, sql } from 'drizzle-orm'

import { cteProcessedMessages } from '../src/database/processing.schema.js'
import { DrizzleCteIssuanceWorkerRepository } from '../src/cte-issuance/infrastructure/drizzle-cte-issuance-worker.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

describeDatabase('CT-e issuance idempotency ledger (integration)', () => {
  const companyId = crypto.randomUUID()
  const otherCompanyId = crypto.randomUUID()

  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const database = provider.db
  const repository = new DrizzleCteIssuanceWorkerRepository(database)

  function messageKey(): {
    readonly attemptId: string
    readonly batchItemId: string
    readonly companyId: string
    readonly eventId: string
  } {
    return {
      attemptId: crypto.randomUUID(),
      batchItemId: crypto.randomUUID(),
      companyId,
      eventId: crypto.randomUUID(),
    }
  }

  beforeAll(async () => {
    await database.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await database.execute(
      sql`insert into companies (id, status) values (${otherCompanyId}, 'active')`,
    )
  })

  afterAll(async () => {
    await database.execute(
      sql`delete from cte_processed_messages where company_id in (${companyId}, ${otherCompanyId})`,
    )
    await database.execute(sql`delete from companies where id in (${companyId}, ${otherCompanyId})`)
    await provider.close()
  })

  it('persists the marker of an event that never existed in processing_outbox', async () => {
    const key = messageKey()

    expect(await repository.hasProcessed(key)).toBeFalse()

    await repository.markProcessed(key)

    expect(await repository.hasProcessed(key)).toBeTrue()

    const [row] = await database
      .select({
        attemptId: cteProcessedMessages.attemptId,
        batchItemId: cteProcessedMessages.batchItemId,
        consumerName: cteProcessedMessages.consumerName,
      })
      .from(cteProcessedMessages)
      .where(
        and(
          eq(cteProcessedMessages.companyId, key.companyId),
          eq(cteProcessedMessages.eventId, key.eventId),
        ),
      )

    expect(row).toEqual({
      attemptId: key.attemptId,
      batchItemId: key.batchItemId,
      consumerName: 'cte-issuance-worker',
    })
  })

  it('keeps a single marker when the same message is processed twice', async () => {
    const key = messageKey()

    await repository.markProcessed(key)
    await repository.markProcessed(key)

    const rows = await database
      .select({ id: cteProcessedMessages.id })
      .from(cteProcessedMessages)
      .where(
        and(
          eq(cteProcessedMessages.companyId, key.companyId),
          eq(cteProcessedMessages.eventId, key.eventId),
        ),
      )

    expect(rows).toHaveLength(1)
  })

  it('persists the dead-letter marker with its reason', async () => {
    const key = messageKey()

    await repository.markDeadLettered({ ...key, reason: 'cte rejected' })

    expect(await repository.hasProcessed(key)).toBeTrue()

    const [row] = await database
      .select({ result: cteProcessedMessages.result })
      .from(cteProcessedMessages)
      .where(
        and(
          eq(cteProcessedMessages.companyId, key.companyId),
          eq(cteProcessedMessages.eventId, key.eventId),
        ),
      )

    expect(JSON.parse(row?.result ?? '{}')).toEqual({ reason: 'cte rejected' })
  })

  it('never reports another company message as processed', async () => {
    const key = messageKey()

    await repository.markProcessed(key)

    expect(await repository.hasProcessed({ ...key, companyId: otherCompanyId })).toBeFalse()
  })
})
