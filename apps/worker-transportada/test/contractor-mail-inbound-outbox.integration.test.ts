/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143 T010. `claimDueEntries`/`markPublished` só se provam contra um Postgres de verdade — o
 * `FOR UPDATE SKIP LOCKED` e a corrida de duas reivindicações concorrentes não se simulam num fake.
 * Molde de `test/contractor-mail-outbound-outbox.integration.test.ts` (T009), sobre
 * `contractor_inbound_email_outbox` — a tabela que a API grava (webhook aceito) e este trilho lê.
 */
import { describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq } from 'drizzle-orm'

import { DrizzleContractorMailInboundOutboxRepository } from '../src/contractor-mail/infrastructure/drizzle-contractor-mail-inbound-outbox.repository.js'
import { contractorInboundEmailOutbox } from '../src/database/contractor-mail.schema.js'
import { companies } from '../src/database/identity.schema.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

describeDatabase('contractor mail inbound outbox repository (integration)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const database = provider.db
  const repository = new DrizzleContractorMailInboundOutboxRepository(database)

  async function seedOutboxRow(): Promise<{
    readonly companyId: string
    readonly eventId: string
    readonly providerEmailId: string
  }> {
    const companyId = crypto.randomUUID()
    const eventId = crypto.randomUUID()
    const providerEmailId = `evt_${crypto.randomUUID()}`

    await database.insert(companies).values({ id: companyId, status: 'active' })
    await database.insert(contractorInboundEmailOutbox).values({
      companyId,
      correlationId: 'contractor-mail-inbound-outbox-integration',
      eventId,
      eventType: 'email.received',
      payload: { providerEmailId },
      providerEmailId,
    })

    return { companyId, eventId, providerEmailId }
  }

  it('claims a due unpublished row, then marks it published so it is not claimed again', async () => {
    const seeded = await seedOutboxRow()
    const claimOwner = `integration-${crypto.randomUUID()}`

    const claimed = await repository.claimDueEntries({
      claimOwner,
      leaseMs: 30_000,
      limit: 10,
      now: new Date(),
    })
    const entry = claimed.find((row) => row.eventId === seeded.eventId)

    expect(entry).toEqual({
      claimOwner,
      companyId: seeded.companyId,
      correlationId: 'contractor-mail-inbound-outbox-integration',
      eventId: seeded.eventId,
      occurredAt: expect.any(String),
      providerEmailId: seeded.providerEmailId,
    })

    await repository.markPublished({
      claimOwner,
      companyId: seeded.companyId,
      eventId: seeded.eventId,
      publishedAt: new Date(),
    })

    const [row] = await database
      .select({ publishedAt: contractorInboundEmailOutbox.publishedAt })
      .from(contractorInboundEmailOutbox)
      .where(eq(contractorInboundEmailOutbox.eventId, seeded.eventId))
    expect(row?.publishedAt).not.toBeNull()

    const claimedAgain = await repository.claimDueEntries({
      claimOwner: `${claimOwner}-again`,
      leaseMs: 30_000,
      limit: 10,
      now: new Date(),
    })
    expect(claimedAgain.some((claimedRow) => claimedRow.eventId === seeded.eventId)).toBe(false)
  })

  it('does not let a second claim take a row already leased by another owner', async () => {
    const seeded = await seedOutboxRow()

    const firstClaim = await repository.claimDueEntries({
      claimOwner: `integration-a-${crypto.randomUUID()}`,
      leaseMs: 30_000,
      limit: 10,
      now: new Date(),
    })
    expect(firstClaim.some((row) => row.eventId === seeded.eventId)).toBe(true)

    const secondClaim = await repository.claimDueEntries({
      claimOwner: `integration-b-${crypto.randomUUID()}`,
      leaseMs: 30_000,
      limit: 10,
      now: new Date(),
    })
    expect(secondClaim.some((row) => row.eventId === seeded.eventId)).toBe(false)
  })
})
