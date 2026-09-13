/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 143 T009. `claimDueEntries`/`markPublished` só se provam contra um Postgres de verdade — o
 * `FOR UPDATE SKIP LOCKED` e a corrida de duas reivindicações concorrentes não se simulam num fake.
 * Molde de `test/cte-issuance-write-back.integration.test.ts`: conecta direto no `DATABASE_URL`
 * compartilhado, sem banco descartável — as linhas usam ids aleatórios e não colidem entre execuções.
 */
import { describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq, sql } from 'drizzle-orm'

import { DrizzleContractorMailOutboundOutboxRepository } from '../src/contractor-mail/infrastructure/drizzle-contractor-mail-outbound-outbox.repository.js'
import { contractorMailOutbox } from '../src/database/contractor-mail.schema.js'
import { companies } from '../src/database/identity.schema.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

describeDatabase('contractor mail outbound outbox repository (integration)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const database = provider.db
  const repository = new DrizzleContractorMailOutboundOutboxRepository(database)

  async function seedOutboxRow(): Promise<{
    readonly companyId: string
    readonly eventId: string
    readonly messageId: string
    readonly replyToAddress: string
    readonly toAddress: string
  }> {
    const companyId = crypto.randomUUID()
    const threadId = crypto.randomUUID()
    const messageId = crypto.randomUUID()
    const eventId = crypto.randomUUID()
    const replyToAddress = `${crypto.randomUUID()}@resposta.example.com.br`
    const toAddress = 'admin@example.com.br'

    await database.insert(companies).values({ id: companyId, status: 'active' })
    const replyTokenHash = crypto.randomUUID().replaceAll('-', '').padEnd(64, '0')
    await database.execute(
      sql`insert into contractor_mail_threads
            (id, company_id, contractor_id, subject_type, subject_id, reply_token_hash, status)
          values (${threadId}, ${companyId}, null, 'setup_test', ${companyId}, ${replyTokenHash}, 'open')`,
    )
    await database.execute(
      sql`insert into contractor_mail_messages
            (id, company_id, thread_id, direction, from_address, body_text, delivery_status)
          values (${messageId}, ${companyId}, ${threadId}, 'outbound', 'ocorrencias@example.com.br',
                  'Este é um e-mail de teste.', 'queued')`,
    )
    await database.insert(contractorMailOutbox).values({
      companyId,
      eventId,
      eventType: 'message.send.requested',
      messageId,
      correlationId: 'contractor-mail-outbound-outbox-integration',
      payload: { replyToAddress, toAddress },
    })

    return { companyId, eventId, messageId, replyToAddress, toAddress }
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
      correlationId: 'contractor-mail-outbound-outbox-integration',
      eventId: seeded.eventId,
      messageId: seeded.messageId,
      occurredAt: expect.any(String),
      replyToAddress: seeded.replyToAddress,
      toAddress: seeded.toAddress,
    })

    await repository.markPublished({
      claimOwner,
      companyId: seeded.companyId,
      eventId: seeded.eventId,
      publishedAt: new Date(),
    })

    const [row] = await database
      .select({ publishedAt: contractorMailOutbox.publishedAt })
      .from(contractorMailOutbox)
      .where(eq(contractorMailOutbox.eventId, seeded.eventId))
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
