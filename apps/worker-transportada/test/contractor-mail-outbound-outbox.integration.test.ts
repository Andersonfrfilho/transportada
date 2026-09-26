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

import { sendContractorMailOutboundMessage } from '../src/contractor-mail/application/send-contractor-mail-outbound-message.use-case.js'
import { DrizzleContractorMailOutboundOutboxRepository } from '../src/contractor-mail/infrastructure/drizzle-contractor-mail-outbound-outbox.repository.js'
import { createDrizzleContractorMailOutboundWorkerRepository } from '../src/contractor-mail/infrastructure/drizzle-contractor-mail-outbound-worker.repository.js'
import type { SendResendEmailInput } from '../src/contractor-mail/infrastructure/resend-mail.gateway.js'
import { contractorMailOutbox } from '../src/database/contractor-mail.schema.js'
import { companies } from '../src/database/identity.schema.js'
import { CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE } from '../src/messaging/contractor-mail-outbound-envelope.schema.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

describeDatabase('contractor mail outbound outbox repository (integration)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const database = provider.db
  const repository = new DrizzleContractorMailOutboundOutboxRepository(database)

  async function seedOutboxRow(
    options: {
      readonly bodyHtml?: string
      readonly toAddresses?: readonly string[]
      /** Sem outbox, a linha não fica devida no banco compartilhado e não disputa as reivindicações. */
      readonly withOutbox?: boolean
    } = {},
  ): Promise<{
    readonly companyId: string
    readonly eventId: string
    readonly messageId: string
    readonly threadId: string
  }> {
    const bodyHtml = options.bodyHtml ?? null
    const toAddresses = options.toAddresses ?? ['admin@example.com.br']
    const companyId = crypto.randomUUID()
    const threadId = crypto.randomUUID()
    const messageId = crypto.randomUUID()
    const eventId = crypto.randomUUID()

    await database.insert(companies).values({ id: companyId, status: 'active' })
    const replyTokenHash = crypto.randomUUID().replaceAll('-', '').padEnd(64, '0')
    await database.execute(
      sql`insert into contractor_mail_threads
            (id, company_id, contractor_id, subject_type, subject_id, reply_token_hash, status)
          values (${threadId}, ${companyId}, null, 'setup_test', ${companyId}, ${replyTokenHash}, 'open')`,
    )
    await database.execute(
      sql`insert into contractor_mail_messages
            (id, company_id, thread_id, direction, from_address, subject, to_addresses, body_text,
             body_html, delivery_status)
          values (${messageId}, ${companyId}, ${threadId}, 'outbound', 'ocorrencias@example.com.br',
                  'Teste de configuração de e-mail com contratantes',
                  array[${sql.join(
                    toAddresses.map((address) => sql`${address}`),
                    sql`, `,
                  )}]::text[],
                  'Este é um e-mail de teste.', ${bodyHtml}, 'queued')`,
    )
    if (options.withOutbox === false) return { companyId, eventId, messageId, threadId }
    await database.insert(contractorMailOutbox).values({
      companyId,
      eventId,
      eventType: 'message.send.requested',
      messageId,
      correlationId: 'contractor-mail-outbound-outbox-integration',
      payload: {},
      // O claim ordena por created_at e limita no banco inteiro: a linha semeada precisa vir primeiro.
      createdAt: sql`coalesce((select min(created_at) from contractor_mail_outbox), now()) - interval '1 minute'`,
      // `now()` do banco tem microssegundo e o `new Date()` do claim, milissegundo — no mesmo ms, não venceu.
      nextAttemptAt: sql`now() - interval '1 minute'`,
    })

    return { companyId, eventId, messageId, threadId }
  }

  /** Spec 150 T302: o `body_html` que a API gravou é o que chega ao gateway, com todos os contatos. */
  it('sends the recorded body_html and every recipient to the mail gateway', async () => {
    const recipients = ['um@example.com.br', 'dois@example.com.br', 'tres@example.com.br']
    const seeded = await seedOutboxRow({
      bodyHtml: '<p>Este é um e-mail de teste.</p>',
      toAddresses: recipients,
      withOutbox: false,
    })
    const workerRepository = createDrizzleContractorMailOutboundWorkerRepository(database)
    const requests: SendResendEmailInput[] = []

    const result = await sendContractorMailOutboundMessage(
      {
        companyId: seeded.companyId,
        correlationId: 'contractor-mail-outbound-outbox-integration',
        eventId: seeded.eventId,
        occurredAt: new Date().toISOString(),
        payload: { messageId: seeded.messageId },
        type: CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE.MESSAGE_SEND_REQUESTED,
        version: 1,
      },
      {
        mailGateway: {
          downloadRawEmail: async () => Buffer.alloc(0),
          fetchReceivedEmail: async () => {
            throw new Error('not used by this integration')
          },
          sendEmail: async (request) => {
            requests.push(request)
            return { id: `resend-${seeded.messageId}` }
          },
        },
        repository: {
          ...workerRepository,
          findSettingsByCompanyId: async () => ({
            id: crypto.randomUUID(),
            replyDomain: 'resposta.example.com.br',
            secretEnvelope: {},
            senderAddress: 'ocorrencias@example.com.br',
            senderName: 'Transportadora',
          }),
        },
        secretService: {
          decrypt: async () => ({
            apiKey: 're_integration',
            replyTokenSecret: 'b'.repeat(64),
            webhookSigningSecret: 'whsec_integration',
          }),
        },
      },
    )

    expect(result).toEqual({ outcome: 'sent', threadId: seeded.threadId })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.html).toBe('<p>Este é um e-mail de teste.</p>')
    expect(requests[0]?.text).toBe('Este é um e-mail de teste.')
    expect(requests[0]?.to).toEqual(recipients)
  })

  it('claims a due unpublished row, then marks it published so it is not claimed again', async () => {
    const seeded = await seedOutboxRow()
    const claimOwner = `integration-${crypto.randomUUID()}`

    const claimed = await repository.claimDueEntries({
      claimOwner,
      leaseMs: 30_000,
      limit: 1,
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
      limit: 1,
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
