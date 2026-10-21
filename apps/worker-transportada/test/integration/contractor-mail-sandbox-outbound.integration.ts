/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 268, contra Postgres real: a linha `sandbox_smtp` do e-mail da contratante sai pelo gateway SMTP do
 * ambiente e fica `sent`, mesmo sem `contractor_mail_settings` e sem tocar o Resend; o mesmo worker sem o modo
 * ligado marca a linha `failed` sem enviar.
 */
import { createHash } from 'node:crypto'

import { afterAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { eq, sql } from 'drizzle-orm'

import { sendContractorMailOutboundMessage } from '../../src/contractor-mail/application/send-contractor-mail-outbound-message.use-case.js'
import type { SendContractorMailOutboundMessageDependencies } from '../../src/contractor-mail/application/send-contractor-mail-outbound-message.use-case.js'
import { createDrizzleContractorMailOutboundWorkerRepository } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail-outbound-worker.repository.js'
import type { SandboxSmtpMailGateway } from '../../src/contractor-mail/infrastructure/sandbox-smtp-mail.gateway.js'
import { contractorMailMessages } from '../../src/database/contractor-mail.schema.js'
import { CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE } from '../../src/messaging/contractor-mail-outbound-envelope.schema.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

describeDatabase('o e-mail da contratante em modo sandbox contra o banco (spec 268)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const database = provider.db
  const repository = createDrizzleContractorMailOutboundWorkerRepository(database)

  /* Todos os arquivos de integração rodam no mesmo processo: pool sem fechar esgota o Postgres da CI. */
  afterAll(async () => {
    await provider.close()
  })

  async function seedSandboxMessage(
    ccAddresses: readonly string[] = [],
  ): Promise<{ companyId: string; messageId: string }> {
    const companyId = crypto.randomUUID()
    const userId = crypto.randomUUID()
    const contractorId = crypto.randomUUID()
    const threadId = crypto.randomUUID()
    const messageId = crypto.randomUUID()
    await database.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await database.execute(
      sql`insert into identity_users (id, status) values (${userId}, 'active')`,
    )
    await database.execute(
      sql`insert into contractors (id, company_id, tax_id) values (${contractorId}, ${companyId}, '11222333000181')`,
    )
    await database.execute(sql`
      insert into contractor_mail_threads (id, company_id, contractor_id, subject_type, subject_id, reply_token_hash)
      values (${threadId}, ${companyId}, ${contractorId}, 'document_occurrence', ${crypto.randomUUID()}, ${createHash('sha256').update(threadId).digest('hex')})
    `)
    await database.execute(sql`
      insert into contractor_mail_messages (id, company_id, thread_id, direction, actor_user_id, from_address, subject, to_addresses, cc_addresses, body_text, delivery_status, transport)
      values (${messageId}, ${companyId}, ${threadId}, 'outbound', ${userId}, 'no-reply@staging.example.test', 'Ocorrência', array['compras@alfa.example.test'], ${`{${ccAddresses.join(',')}}`}::text[], 'Autorizam?', 'queued', 'sandbox_smtp')
    `)
    return { companyId, messageId }
  }

  function dependencies(sandbox: SandboxSmtpMailGateway | undefined) {
    const resendCalls: string[] = []
    const value: SendContractorMailOutboundMessageDependencies = {
      attachments: { list: async () => [], read: async () => undefined },
      mailGateway: {
        downloadRawEmail: async () => Buffer.alloc(0),
        fetchReceivedEmail: async () => {
          resendCalls.push('fetch')
          throw new Error('sandbox never calls Resend')
        },
        sendEmail: async () => {
          resendCalls.push('send')
          throw new Error('sandbox never calls Resend')
        },
      },
      repository,
      ...(sandbox === undefined ? {} : { sandboxMailGateway: sandbox }),
      secretService: {
        decrypt: async () => {
          throw new Error('sandbox never opens the company credential')
        },
      },
    }
    return { resendCalls, value }
  }

  function envelope(companyId: string, messageId: string) {
    return {
      companyId,
      correlationId: 'sandbox-integration-0001',
      eventId: crypto.randomUUID(),
      occurredAt: new Date(0).toISOString(),
      payload: { messageId },
      type: CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE.MESSAGE_SEND_REQUESTED,
      version: 1,
    } as const
  }

  async function readStatus(messageId: string) {
    const [row] = await database
      .select({
        deliveryStatus: contractorMailMessages.deliveryStatus,
        providerEmailId: contractorMailMessages.providerEmailId,
      })
      .from(contractorMailMessages)
      .where(eq(contractorMailMessages.id, messageId))
    return row
  }

  it('sem configuração da empresa, envia pelo SMTP do ambiente e marca a linha como enviada', async () => {
    const { companyId, messageId } = await seedSandboxMessage()
    const sent: { from: unknown; to: readonly string[] }[] = []
    const { resendCalls, value } = dependencies({
      sendEmail: async (request) => {
        sent.push({ from: request.from, to: request.to })
        return { id: '<sandbox-1@mailpit>' }
      },
    })

    const result = await sendContractorMailOutboundMessage(envelope(companyId, messageId), value)

    expect(result.outcome).toBe('sent')
    expect(sent).toEqual([
      { from: 'no-reply@staging.example.test', to: ['compras@alfa.example.test'] },
    ])
    expect(resendCalls).toEqual([])
    expect(await readStatus(messageId)).toEqual({
      deliveryStatus: 'sent',
      providerEmailId: '<sandbox-1@mailpit>',
    })
  })

  it('lê a cópia gravada pela API e a leva no cc (spec 267)', async () => {
    const { companyId, messageId } = await seedSandboxMessage(['ana@empresa.example.test'])
    const copies: (readonly string[] | undefined)[] = []
    const { value } = dependencies({
      sendEmail: async (request) => {
        copies.push(request.cc)
        return { id: '<sandbox-cc@mailpit>' }
      },
    })

    await sendContractorMailOutboundMessage(envelope(companyId, messageId), value)

    expect(copies).toEqual([['ana@empresa.example.test']])
  })

  it('worker sem o modo ligado marca a linha como falha, sem enviar', async () => {
    const { companyId, messageId } = await seedSandboxMessage()
    const { resendCalls, value } = dependencies(undefined)

    const result = await sendContractorMailOutboundMessage(envelope(companyId, messageId), value)

    expect(result).toMatchObject({ outcome: 'failed', reason: 'sandbox_disabled' })
    expect(resendCalls).toEqual([])
    expect(await readStatus(messageId)).toEqual({ deliveryStatus: 'failed', providerEmailId: null })
  })
})
