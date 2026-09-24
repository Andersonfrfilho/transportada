/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T405 (RF7, RF14), contra Postgres real: o e-mail que a contratante responde numa thread
 * da conversa da ocorrência vira mensagem recebida dessa conversa, na mesma transação da 143, uma vez
 * só; e o status que o Resend dá ao envio chega à mensagem da conversa pela política (RF14). Thread
 * da 143 sem conversa (correção de endereço, por exemplo) segue como estava.
 */
import { createHash } from 'node:crypto'

import { describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, sql } from 'drizzle-orm'

import { createDrizzleContractorMailInboundWorkerRepository } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail-inbound-worker.repository.js'
import { createDrizzleContractorMailOutboundWorkerRepository } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail-outbound-worker.repository.js'
import { contractorMailMessages } from '../../src/database/contractor-mail.schema.js'
import { occurrenceConversationMessages } from '../../src/database/occurrence-conversation.schema.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

type Seeded = {
  readonly companyId: string
  readonly conversationId: string | null
  readonly mailMessageId: string
  readonly threadId: string
}

describeDatabase('conversa da ocorrência pelo trilho de e-mail da 143 (spec 183 T405)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const database = provider.db
  const inbound = createDrizzleContractorMailInboundWorkerRepository(database)
  const outbound = createDrizzleContractorMailOutboundWorkerRepository(database)

  /** Uma thread da 143 com uma mensagem enviada; `withConversation` a liga à conversa (T403). */
  async function seed(input: { readonly withConversation: boolean }): Promise<Seeded> {
    const companyId = crypto.randomUUID()
    const userId = crypto.randomUUID()
    const contractorId = crypto.randomUUID()
    const threadId = crypto.randomUUID()
    const mailMessageId = crypto.randomUUID()
    const occurrenceId = crypto.randomUUID()
    const conversationId = input.withConversation ? crypto.randomUUID() : null

    await database.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await database.execute(
      sql`insert into identity_users (id, status) values (${userId}, 'active')`,
    )
    await database.execute(
      sql`insert into contractors (id, company_id, tax_id) values (${contractorId}, ${companyId}, '11222333000181')`,
    )
    await database.execute(sql`
      insert into contractor_mail_threads (id, company_id, contractor_id, subject_type, subject_id, reply_token_hash)
      values (${threadId}, ${companyId}, ${contractorId}, 'document_occurrence', ${occurrenceId}, ${createHash('sha256').update(threadId).digest('hex')})
    `)
    await database.execute(sql`
      insert into contractor_mail_messages (id, company_id, thread_id, direction, actor_user_id, from_address, subject, to_addresses, body_text, delivery_status)
      values (${mailMessageId}, ${companyId}, ${threadId}, 'outbound', ${userId}, 'ocorrencias@transportadora.example.test', 'Ocorrência', array['compras@alfa.example.test'], 'Autorizam?', 'queued')
    `)
    if (conversationId !== null) {
      await database.execute(sql`
        insert into occurrence_conversations (id, company_id, occurrence_kind, occurrence_id, participant, contractor_id, public_ref)
        values (${conversationId}, ${companyId}, 'document', ${occurrenceId}, 'contractor', ${contractorId}, ${`ref${crypto.randomUUID().replaceAll('-', '')}`})
      `)
      await database.execute(sql`
        insert into occurrence_conversation_messages (company_id, conversation_id, channel, direction, author_user_id, body_text, status, status_times, mail_message_id)
        values (${companyId}, ${conversationId}, 'email', 'outbound', ${userId}, 'Autorizam?', 'queued', '{"queued":"2026-09-24T12:00:00.000Z"}'::jsonb, ${mailMessageId})
      `)
    }
    return { companyId, conversationId, mailMessageId, threadId }
  }

  function recordReply(seeded: Seeded, providerEmailId: string, bodyText = 'Podem descarregar.') {
    return inbound.recordInboundMessage({
      bodyText,
      companyId: seeded.companyId,
      dkimResult: 'aligned',
      fromAddress: 'compras@alfa.example.test',
      fromDisplayName: 'Compras Alfa',
      inReplyTo: undefined,
      providerEmailId,
      raw: {
        bucket: 'transportada-test',
        key: `tenants/${seeded.companyId}/contractor-mail/${providerEmailId}/raw.eml`,
        mimeType: 'message/rfc822',
        provider: 'minio',
        sha256: 'a'.repeat(64),
        sizeBytes: 10,
      },
      rfcMessageId: `${providerEmailId}@example.test`,
      subject: 'Re: Ocorrência',
      threadId: seeded.threadId,
      toAddresses: ['r+token@reply.example.test'],
    })
  }

  function conversationMessages(companyId: string) {
    return database
      .select({
        bodyText: occurrenceConversationMessages.bodyText,
        channel: occurrenceConversationMessages.channel,
        conversationId: occurrenceConversationMessages.conversationId,
        direction: occurrenceConversationMessages.direction,
        mailMessageId: occurrenceConversationMessages.mailMessageId,
        providerMessageId: occurrenceConversationMessages.providerMessageId,
        senderAddress: occurrenceConversationMessages.senderAddress,
        status: occurrenceConversationMessages.status,
        statusTimes: occurrenceConversationMessages.statusTimes,
      })
      .from(occurrenceConversationMessages)
      .where(eq(occurrenceConversationMessages.companyId, companyId))
  }

  it('a resposta da contratante vira mensagem recebida da conversa, uma vez só', async () => {
    const seeded = await seed({ withConversation: true })
    const providerEmailId = `re_${crypto.randomUUID()}`

    const recorded = await recordReply(seeded, providerEmailId)
    await recordReply(seeded, providerEmailId)

    const received = (await conversationMessages(seeded.companyId)).filter(
      (message) => message.direction === 'inbound',
    )
    /** Spec 183 T406 (RF16): o nome do `From` fica gravado na mensagem da 143. */
    const [mail] = await database
      .select({ fromDisplayName: contractorMailMessages.fromDisplayName })
      .from(contractorMailMessages)
      .where(eq(contractorMailMessages.id, recorded.id))
    expect(mail?.fromDisplayName).toBe('Compras Alfa')
    expect(received).toEqual([
      {
        bodyText: 'Podem descarregar.',
        channel: 'email',
        conversationId: seeded.conversationId ?? 'semeada com conversa',
        direction: 'inbound',
        mailMessageId: recorded.id,
        providerMessageId: null,
        senderAddress: 'compras@alfa.example.test',
        status: null,
        statusTimes: {},
      },
    ])
  })

  it('o corpo acima do limite da conversa entra cortado; o inteiro segue na 143 e no MIME', async () => {
    const seeded = await seed({ withConversation: true })

    await recordReply(seeded, `re_${crypto.randomUUID()}`, 'x'.repeat(9000))

    const [received] = (await conversationMessages(seeded.companyId)).filter(
      (message) => message.direction === 'inbound',
    )
    expect(received?.bodyText.length).toBe(8000)
  })

  it('thread da 143 sem conversa grava só a mensagem da 143', async () => {
    const seeded = await seed({ withConversation: false })

    await recordReply(seeded, `re_${crypto.randomUUID()}`)

    expect(await conversationMessages(seeded.companyId)).toEqual([])
  })

  it('o envio aceito pelo Resend leva a mensagem da conversa a sent, com o id e o horário', async () => {
    const seeded = await seed({ withConversation: true })
    const providerEmailId = `em_${crypto.randomUUID()}`

    await outbound.markMessageSent({
      companyId: seeded.companyId,
      messageId: seeded.mailMessageId,
      providerEmailId,
    })

    const [sent] = await conversationMessages(seeded.companyId)
    expect(sent?.status).toBe('sent')
    expect(sent?.providerMessageId).toBe(providerEmailId)
    expect(sent?.statusTimes.queued).toBe('2026-09-24T12:00:00.000Z')
    expect(typeof sent?.statusTimes.sent).toBe('string')
  })

  it('a falha do envio chega como failed; depois dela, nada avança', async () => {
    const seeded = await seed({ withConversation: true })

    await outbound.markMessageFailed({
      companyId: seeded.companyId,
      messageId: seeded.mailMessageId,
    })
    await outbound.markMessageSent({
      companyId: seeded.companyId,
      messageId: seeded.mailMessageId,
      providerEmailId: `em_${crypto.randomUUID()}`,
    })

    const [message] = await conversationMessages(seeded.companyId)
    expect(message?.status).toBe('failed')
  })

  it('outra empresa não toca a mensagem da conversa', async () => {
    const seeded = await seed({ withConversation: true })
    const other = await seed({ withConversation: false })

    await outbound.markMessageSent({
      companyId: other.companyId,
      messageId: seeded.mailMessageId,
      providerEmailId: `em_${crypto.randomUUID()}`,
    })

    const [message] = await database
      .select({ status: occurrenceConversationMessages.status })
      .from(occurrenceConversationMessages)
      .where(
        and(
          eq(occurrenceConversationMessages.companyId, seeded.companyId),
          eq(occurrenceConversationMessages.mailMessageId, seeded.mailMessageId),
        ),
      )
    expect(message?.status).toBe('queued')
  })
})
