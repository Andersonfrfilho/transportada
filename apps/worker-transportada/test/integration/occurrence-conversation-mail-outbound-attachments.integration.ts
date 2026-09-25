/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T702e, contra Postgres e o S3 de verdade: o e-mail que o operador manda à contratante sai
 * com os arquivos ligados à mensagem da conversa (a API liga; o worker acha pela `mail_message_id`),
 * lidos do bucket e conferidos pelo `sha256`. Outra empresa não enxerga os anexos; objeto sumido
 * falha o envio em vez de sair sem o arquivo. O Resend é um `fetch` falso que guarda o corpo.
 */
import { createHash } from 'node:crypto'

import { afterAll, describe, expect, test } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { sendContractorMailOutboundMessage } from '../../src/contractor-mail/application/send-contractor-mail-outbound-message.use-case.js'
import { createDrizzleContractorMailOutboundWorkerRepository } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail-outbound-worker.repository.js'
import { createResendMailGateway } from '../../src/contractor-mail/infrastructure/resend-mail.gateway.js'
import { CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE } from '../../src/messaging/contractor-mail-outbound-envelope.schema.js'
import { createContractorMailOutboundAttachments } from '../../src/occurrence-conversation/infrastructure/drizzle-conversation-mail-attachments.repository.js'
import { createNfeStorageGatewayFromEnvironment } from '../../src/storage/infrastructure/nfe-storage-gateway.js'

const databaseUrl = process.env.DATABASE_URL
const bucket = process.env.STORAGE_BUCKET ?? process.env.OBJECT_STORAGE_BUCKET
const describeIntegration =
  databaseUrl !== undefined && bucket !== undefined ? describe : describe.skip

const PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n')

describeIntegration('o e-mail da conversa sai com os anexos (spec 183 T702e)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl ?? 'postgres://unused' })
  const database = provider.db
  const storage = createNfeStorageGatewayFromEnvironment({
    environment: process.env,
    finalBucket: bucket as string,
    stagingBucket: bucket as string,
  })
  const keys: string[] = []

  afterAll(async () => {
    await Promise.allSettled(
      keys.map((key) => storage.deleteObject({ bucket: bucket as string, key })),
    )
    await provider.close?.()
  })

  /** Uma mensagem enviada da 143, a da conversa que aponta para ela e um PDF ligado à da conversa. */
  async function seed(input: { readonly uploadObject: boolean }) {
    const companyId = crypto.randomUUID()
    const userId = crypto.randomUUID()
    const contractorId = crypto.randomUUID()
    const threadId = crypto.randomUUID()
    const mailMessageId = crypto.randomUUID()
    const occurrenceId = crypto.randomUUID()
    const conversationId = crypto.randomUUID()
    const conversationMessageId = crypto.randomUUID()
    const storedObjectId = crypto.randomUUID()
    const key = `occurrence-conversations/${crypto.randomUUID().replaceAll('-', '')}`
    const sha256 = createHash('sha256').update(PDF).digest('hex')

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
      values (${mailMessageId}, ${companyId}, ${threadId}, 'outbound', ${userId}, 'ocorrencias@transportadora.example.test', 'Ocorrência', array['compras@alfa.example.test'], 'Segue a nota.', 'queued')
    `)
    await database.execute(sql`
      insert into occurrence_conversations (id, company_id, occurrence_kind, occurrence_id, participant, contractor_id, public_ref)
      values (${conversationId}, ${companyId}, 'document', ${occurrenceId}, 'contractor', ${contractorId}, ${`ref${crypto.randomUUID().replaceAll('-', '')}`})
    `)
    await database.execute(sql`
      insert into occurrence_conversation_messages (id, company_id, conversation_id, channel, direction, author_user_id, body_text, status, status_times, mail_message_id)
      values (${conversationMessageId}, ${companyId}, ${conversationId}, 'email', 'outbound', ${userId}, 'Segue a nota.', 'queued', '{"queued":"2026-09-25T12:00:00.000Z"}'::jsonb, ${mailMessageId})
    `)
    if (input.uploadObject) {
      keys.push(key)
      await storage.storeObject({
        body: PDF,
        bucket: bucket as string,
        contentLength: PDF.byteLength,
        contentType: 'application/pdf',
        key,
        sha256,
      })
    }
    await database.execute(sql`
      insert into stored_objects (id, company_id, provider, bucket, object_key, mime_type, size_bytes, sha256, status, purpose)
      values (${storedObjectId}, ${companyId}, 's3', ${bucket}, ${key}, 'application/pdf', ${PDF.byteLength}, ${sha256}, 'final', 'occurrence_conversation_attachment')
    `)
    await database.execute(sql`
      insert into occurrence_conversation_attachments (company_id, message_id, stored_object_id, sha256, size_bytes, content_type, file_name)
      values (${companyId}, ${conversationMessageId}, ${storedObjectId}, ${sha256}, ${PDF.byteLength}, 'application/pdf', 'nota de devolução.pdf')
    `)
    return { companyId, mailMessageId }
  }

  function send(seeded: { readonly companyId: string; readonly mailMessageId: string }) {
    const bodies: Record<string, unknown>[] = []
    const run = sendContractorMailOutboundMessage(
      {
        companyId: seeded.companyId,
        correlationId: 'conversation-mail-attachments-integration',
        eventId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        payload: { messageId: seeded.mailMessageId },
        type: CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE.MESSAGE_SEND_REQUESTED,
        version: 1,
      },
      {
        attachments: createContractorMailOutboundAttachments({ database, storage }),
        mailGateway: createResendMailGateway({
          fetch: async (_target, init) => {
            bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
            return Response.json({ id: `em_${crypto.randomUUID()}` })
          },
        }),
        repository: {
          ...createDrizzleContractorMailOutboundWorkerRepository(database),
          findSettingsByCompanyId: async () => ({
            id: crypto.randomUUID(),
            replyDomain: 'resposta.transportadora.example.test',
            secretEnvelope: {},
            senderAddress: 'ocorrencias@transportadora.example.test',
            senderName: 'Transportadora',
          }),
        },
        secretService: {
          decrypt: async () => ({
            apiKey: 're_test',
            replyTokenSecret: 'a'.repeat(64),
            webhookSigningSecret: 'whsec_test',
          }),
        },
      },
    )
    return { bodies, run }
  }

  test('o PDF sai em base64 com o nome, e os bytes são os do bucket', async () => {
    const seeded = await seed({ uploadObject: true })

    const { bodies, run } = send(seeded)
    expect(await run).toMatchObject({ outcome: 'sent' })

    expect(bodies[0]?.attachments).toEqual([
      {
        content: Buffer.from(PDF).toString('base64'),
        content_type: 'application/pdf',
        filename: 'nota de devolução.pdf',
      },
    ])
  })

  test('outra empresa não enxerga os anexos da mensagem', async () => {
    const seeded = await seed({ uploadObject: true })
    const port = createContractorMailOutboundAttachments({ database, storage })

    expect(
      await port.list({ companyId: crypto.randomUUID(), messageId: seeded.mailMessageId }),
    ).toEqual([])
    expect(
      await port.list({ companyId: seeded.companyId, messageId: seeded.mailMessageId }),
    ).toHaveLength(1)
  })

  test('objeto que não está no bucket: failed, sem chamar o Resend', async () => {
    const seeded = await seed({ uploadObject: false })

    const { bodies, run } = send(seeded)
    expect(await run).toMatchObject({ outcome: 'failed', reason: 'attachment_unavailable' })
    expect(bodies).toEqual([])
    const [row] = await database.execute<{ delivery_status: string }>(
      sql`select delivery_status from contractor_mail_messages where id = ${seeded.mailMessageId}`,
    )
    expect(row?.delivery_status).toBe('failed')
  })

  test('T903 (F1): objeto apagado pelo expurgo falha o envio, nunca sai sem o anexo', async () => {
    const seeded = await seed({ uploadObject: true })
    await database.execute(sql`
      update stored_objects set status = 'deleted', deleted_at = now()
      where company_id = ${seeded.companyId} and purpose = 'occurrence_conversation_attachment'
    `)

    const { bodies, run } = send(seeded)
    expect(await run).toMatchObject({ outcome: 'failed', reason: 'attachment_unavailable' })
    expect(bodies).toEqual([])
  })
})
