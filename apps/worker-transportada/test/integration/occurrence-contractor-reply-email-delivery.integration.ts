/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.7, contra Postgres real (o storage é o dublê em memória; o Resend, um `fetch` falso): o boleto
 * levado a um terceiro sai pelo worker preso à thread da ocorrência, mas sem token de resposta e sem
 * `In-Reply-To`; o `Reply-To` é o contato da empresa (quando há); o PDF vem da entrega, não de mensagem de
 * conversa; e a entrega acompanha o desfecho do envio (`sent` com data, ou `failed` / `send_failed`).
 */
import { createHash } from 'node:crypto'

import { afterAll, describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { sendContractorMailOutboundMessage } from '../../src/contractor-mail/application/send-contractor-mail-outbound-message.use-case.js'
import { createDrizzleContractorMailOutboundWorkerRepository } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail-outbound-worker.repository.js'
import { createResendMailGateway } from '../../src/contractor-mail/infrastructure/resend-mail.gateway.js'
import { CONTRACTOR_MAIL_OUTBOUND_EVENT_TYPE } from '../../src/messaging/contractor-mail-outbound-envelope.schema.js'
import { createContractorMailOutboundAttachments } from '../../src/occurrence-conversation/infrastructure/drizzle-conversation-mail-attachments.repository.js'
import { createNfeStorageGateway } from '../../src/storage/infrastructure/nfe-storage-gateway.js'
import { createInMemoryObjectStorageProvider } from '../fixtures/in-memory-object-storage.fixture.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip
const bucket = 'transportada-test'
const PDF = new TextEncoder().encode('%PDF-1.7\n1 0 obj << /Type /Catalog >> endobj\n%%EOF\n')
const RECIPIENT = 'cliente@destino.example.test'
const COMPANY_CONTACT = 'contato@transportadora.example.test'

type Seeded = {
  readonly companyId: string
  readonly deliveryId: string
  readonly mailMessageId: string
}

describeDatabase('o boleto levado a um terceiro sai pelo worker (spec 248 T4.7)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const database = provider.db
  const storage = createNfeStorageGateway({
    finalBucket: bucket,
    provider: createInMemoryObjectStorageProvider({ maxObjectSizeBytes: 25 * 1024 * 1024 }),
    stagingBucket: bucket,
  })
  const keys: string[] = []

  afterAll(async () => {
    await Promise.allSettled(keys.map((key) => storage.deleteObject({ bucket, key })))
    await provider.close?.()
  })

  async function seedOccurrence(companyId: string, userId: string): Promise<string> {
    const vehicleId = crypto.randomUUID()
    const tripId = crypto.randomUUID()
    const xmlObjectId = crypto.randomUUID()
    const importId = crypto.randomUUID()
    const documentId = crypto.randomUUID()
    const tripDocumentId = crypto.randomUUID()
    const typeId = crypto.randomUUID()
    const accessKey = String(BigInt(`0x${crypto.randomUUID().replaceAll('-', '')}`))
      .padStart(44, '0')
      .slice(0, 44)
    const occurrenceId = crypto.randomUUID()
    await database.execute(sql`
      insert into fleet_vehicles (id, company_id, plate, role, vehicle_type, state)
      values (${vehicleId}, ${companyId}, 'GCQ8E48', 'traction', 'tractor_unit', 'SP')`)
    await database.execute(
      sql`insert into trips (id, company_id, vehicle_id, status) values (${tripId}, ${companyId}, ${vehicleId}, 'completed')`,
    )
    await database.execute(sql`
      insert into stored_objects (id, company_id, bucket, object_key, provider, purpose, mime_type, sha256, size_bytes, status)
      values (${xmlObjectId}, ${companyId}, 'transportada-test', ${`tenants/${companyId}/nfe-xml/${xmlObjectId}`}, 's3', 'nfe_document', 'application/xml', ${'0'.repeat(64)}, 10, 'final')`)
    await database.execute(sql`
      insert into nfe_imports (id, company_id, source, requested_by_user_id, correlation_id, idempotency_key, request_fingerprint, status)
      values (${importId}, ${companyId}, 'upload', ${userId}, ${importId}, ${importId}, ${importId}, 'completed')`)
    await database.execute(sql`
      insert into nfe_documents (id, company_id, access_key, model, number, series, issued_at, operation_nature, operation_type, status, source, total_value, products_value, xml_object_id, xml_sha256, import_id, created_by_user_id, authorization_protocol, recipient_email)
      values (${documentId}, ${companyId}, ${accessKey}, '55', '1', '1', now(), 'venda', '1', 'authorized', 'upload', '10.00', '10.00', ${xmlObjectId}, ${'0'.repeat(64)}, ${importId}, ${userId}, 'protocol', ${RECIPIENT})`)
    await database.execute(
      sql`insert into trip_documents (id, company_id, trip_id, nfe_document_id) values (${tripDocumentId}, ${companyId}, ${tripId}, ${documentId})`,
    )
    await database.execute(sql`
      insert into company_occurrence_types (id, company_id, name, stage, notifies, active)
      values (${typeId}, ${companyId}, 'Caixa violada', 'separation', false, true)`)
    await database.execute(sql`
      insert into trip_document_occurrences (id, company_id, trip_document_id, stage, occurrence_type_id, actor_user_id)
      values (${occurrenceId}, ${companyId}, ${tripDocumentId}, 'separation', ${typeId}, ${userId})`)
    return occurrenceId
  }

  async function seed(input: {
    readonly companyContact: boolean
    /** Spec 279 T3: o alvo do cadastro do cliente segue o mesmo caminho dos encaminhamentos da 248. */
    readonly target?: 'client_boleto_emails' | 'note_recipient_email'
    readonly uploadObject: boolean
  }): Promise<Seeded> {
    const target = input.target ?? 'note_recipient_email'
    const companyId = crypto.randomUUID()
    const userId = crypto.randomUUID()
    const contractorId = crypto.randomUUID()
    const threadId = crypto.randomUUID()
    const requestMailId = crypto.randomUUID()
    const forwardMailId = crypto.randomUUID()
    const conversationId = crypto.randomUUID()
    const replyMessageId = crypto.randomUUID()
    const replyId = crypto.randomUUID()
    const deliveryId = crypto.randomUUID()
    const storedObjectId = crypto.randomUUID()
    const attachmentId = crypto.randomUUID()
    const key = `occurrence-conversations/${crypto.randomUUID().replaceAll('-', '')}`
    const sha256 = createHash('sha256').update(PDF).digest('hex')

    await database.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await database.execute(
      sql`insert into identity_users (id, status) values (${userId}, 'active')`,
    )
    await database.execute(
      sql`insert into user_company_memberships (id, user_id, company_id, status) values (${crypto.randomUUID()}, ${userId}, ${companyId}, 'active')`,
    )
    await database.execute(
      sql`insert into contractors (id, company_id, tax_id) values (${contractorId}, ${companyId}, '11222333000181')`,
    )
    const occurrenceId = await seedOccurrence(companyId, userId)
    await database.execute(sql`
      insert into contractor_mail_threads (id, company_id, contractor_id, subject_type, subject_id, reply_token_hash)
      values (${threadId}, ${companyId}, ${contractorId}, 'document_occurrence', ${occurrenceId}, ${createHash('sha256').update(threadId).digest('hex')})`)
    await database.execute(sql`
      insert into contractor_mail_messages (id, company_id, thread_id, direction, actor_user_id, from_address, subject, to_addresses, body_text, delivery_status)
      values (${requestMailId}, ${companyId}, ${threadId}, 'outbound', ${userId}, 'ocorrencias@transportadora.example.test', 'Ocorrência', array['compras@alfa.example.test'], 'Autorizam?', 'sent')`)
    await database.execute(sql`
      insert into contractor_mail_messages (id, company_id, thread_id, direction, from_address, subject, to_addresses, body_text, rfc_message_id)
      values (${crypto.randomUUID()}, ${companyId}, ${threadId}, 'inbound', 'compras@alfa.example.test', 'Re: Ocorrência', array['resposta@x.example.test'], 'Segue.', '<contratante@alfa.example.test>')`)
    await database.execute(sql`
      insert into occurrence_conversations (id, company_id, occurrence_kind, occurrence_id, participant, contractor_id, public_ref)
      values (${conversationId}, ${companyId}, 'document', ${occurrenceId}, 'contractor', ${contractorId}, ${`ref${crypto.randomUUID().replaceAll('-', '')}`})`)
    await database.execute(sql`
      insert into occurrence_conversation_messages (id, company_id, conversation_id, channel, direction, sender_address, body_text)
      values (${replyMessageId}, ${companyId}, ${conversationId}, 'email', 'inbound', 'compras@alfa.example.test', 'Segue o boleto.')`)
    if (input.uploadObject) {
      keys.push(key)
      await storage.storeObject({
        body: PDF,
        bucket,
        contentLength: PDF.byteLength,
        contentType: 'application/pdf',
        key,
        sha256,
      })
    }
    await database.execute(sql`
      insert into stored_objects (id, company_id, provider, bucket, object_key, mime_type, size_bytes, sha256, status, purpose)
      values (${storedObjectId}, ${companyId}, 's3', ${bucket}, ${key}, 'application/pdf', ${PDF.byteLength}, ${sha256}, 'final', 'occurrence_conversation_attachment')`)
    await database.execute(sql`
      insert into occurrence_conversation_attachments (id, company_id, message_id, stored_object_id, sha256, size_bytes, content_type, file_name)
      values (${attachmentId}, ${companyId}, ${replyMessageId}, ${storedObjectId}, ${sha256}, ${PDF.byteLength}, 'application/pdf', 'boleto.pdf')`)
    const config = JSON.stringify({
      attachmentKind: 'pdf',
      mode: 'forward_after_approval',
      version: 1,
    })
    await database.execute(sql`
      insert into occurrence_contractor_replies (id, company_id, occurrence_id, conversation_id, config, status, reply_message_id, reply_attachment_id)
      values (${replyId}, ${companyId}, ${occurrenceId}, ${conversationId}, (${config}::text)::jsonb, 'awaiting_operator', ${replyMessageId}, ${attachmentId})`)
    await database.execute(sql`
      insert into contractor_mail_messages (id, company_id, thread_id, direction, actor_user_id, from_address, subject, to_addresses, body_text, delivery_status)
      values (${forwardMailId}, ${companyId}, ${threadId}, 'outbound', ${userId}, 'ocorrencias@transportadora.example.test', 'Boleto prorrogado', array[${RECIPIENT}], 'Segue o boleto.', 'queued')`)
    await database.execute(sql`
      insert into occurrence_contractor_reply_deliveries (id, company_id, reply_id, target, trigger, status, address, attachment_id, mail_message_id, actor_user_id, idempotency_key)
      values (${deliveryId}, ${companyId}, ${replyId}, ${target}, 'operator', 'queued', ${RECIPIENT}, ${attachmentId}, ${forwardMailId}, ${userId}, ${`${target}:${deliveryId.replaceAll('-', '')}`})`)
    if (input.companyContact) {
      await database.execute(sql`
        insert into company_contacts (company_id, kind, value, position)
        values (${companyId}, 'phone', '11987654321', 0), (${companyId}, 'email', ${COMPANY_CONTACT}, 1)`)
    }
    return { companyId, deliveryId, mailMessageId: forwardMailId }
  }

  function send(seeded: Seeded) {
    const bodies: Record<string, unknown>[] = []
    const run = sendContractorMailOutboundMessage(
      {
        companyId: seeded.companyId,
        correlationId: 'contractor-reply-email-integration',
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

  async function deliveryOf(seeded: Seeded) {
    const [row] = await database.execute<{
      reason: null | string
      sent_at: Date | null
      status: string
    }>(
      sql`select status, reason, sent_at from occurrence_contractor_reply_deliveries where id = ${seeded.deliveryId}`,
    )
    return row
  }

  it('sai com o PDF da entrega, sem token e sem In-Reply-To, com o contato da empresa no Reply-To', async () => {
    const seeded = await seed({ companyContact: true, uploadObject: true })

    const { bodies, run } = send(seeded)
    expect(await run).toMatchObject({ outcome: 'sent' })

    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({
      attachments: [
        {
          content: Buffer.from(PDF).toString('base64'),
          content_type: 'application/pdf',
          filename: 'boleto.pdf',
        },
      ],
      headers: {},
      reply_to: COMPANY_CONTACT,
      to: [RECIPIENT],
    })
    expect(JSON.stringify(bodies[0])).not.toContain('resposta.transportadora.example.test')
    const delivery = await deliveryOf(seeded)
    expect(delivery?.status).toBe('sent')
    expect(delivery?.sent_at).not.toBeNull()
    const [message] = await database.execute<{ delivery_status: string }>(
      sql`select delivery_status from contractor_mail_messages where id = ${seeded.mailMessageId}`,
    )
    expect(message?.delivery_status).toBe('sent')
  })

  it('alvo do cadastro do cliente (spec 279 T3): sai com o PDF, sem token, e a entrega fecha como sent', async () => {
    const seeded = await seed({
      companyContact: true,
      target: 'client_boleto_emails',
      uploadObject: true,
    })

    const { bodies, run } = send(seeded)
    expect(await run).toMatchObject({ outcome: 'sent' })

    expect(bodies[0]).toMatchObject({
      attachments: [{ filename: 'boleto.pdf' }],
      headers: {},
      reply_to: COMPANY_CONTACT,
      to: [RECIPIENT],
    })
    expect(JSON.stringify(bodies[0])).not.toContain('resposta.transportadora.example.test')
    const delivery = await deliveryOf(seeded)
    expect(delivery?.status).toBe('sent')
    expect(delivery?.sent_at).not.toBeNull()
  })

  it('alvo do cadastro do cliente sem o PDF no bucket: a entrega falha com send_failed', async () => {
    const seeded = await seed({
      companyContact: false,
      target: 'client_boleto_emails',
      uploadObject: false,
    })

    const { bodies, run } = send(seeded)
    expect(await run).toMatchObject({ outcome: 'failed', reason: 'attachment_unavailable' })
    expect(bodies).toEqual([])
    expect(await deliveryOf(seeded)).toMatchObject({ reason: 'send_failed', status: 'failed' })
  })

  it('empresa sem e-mail de contato: nenhum Reply-To', async () => {
    const seeded = await seed({ companyContact: false, uploadObject: true })

    const { bodies, run } = send(seeded)
    expect(await run).toMatchObject({ outcome: 'sent' })

    expect(bodies[0] && 'reply_to' in bodies[0]).toBe(false)
  })

  it('o contato de outra empresa nunca vira o Reply-To', async () => {
    await seed({ companyContact: true, uploadObject: true })
    const seeded = await seed({ companyContact: false, uploadObject: true })

    const { bodies, run } = send(seeded)
    await run

    expect(bodies[0] && 'reply_to' in bodies[0]).toBe(false)
  })

  it('PDF que não está no bucket: a mensagem e a entrega falham, nada vai ao Resend', async () => {
    const seeded = await seed({ companyContact: true, uploadObject: false })

    const { bodies, run } = send(seeded)
    expect(await run).toMatchObject({ outcome: 'failed', reason: 'attachment_unavailable' })

    expect(bodies).toEqual([])
    expect(await deliveryOf(seeded)).toMatchObject({
      reason: 'send_failed',
      sent_at: null,
      status: 'failed',
    })
  })
})
