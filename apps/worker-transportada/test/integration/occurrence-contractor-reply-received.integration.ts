/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.5 (CA02, CA09), contra Postgres real: a resposta da contratante por e-mail, gravada na
 * conversa pelo trilho da 143, move o retorno na mesma transação. Anexo aceito leva a
 * `awaiting_operator` (ou `reply_received` no modo automático); sem anexo aceito ou com mais de um vai
 * ao operador com o motivo; a reentrega do mesmo e-mail não move de novo; a empresa B nunca move o
 * retorno da A. A entrega ao motorista é a T4.6 e não passa por aqui.
 */
import { createHash } from 'node:crypto'

import { describe, expect, it } from 'bun:test'
import { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { createDrizzleContractorMailInboundWorkerRepository } from '../../src/contractor-mail/infrastructure/drizzle-contractor-mail-inbound-worker.repository.js'

const databaseUrl = process.env.DATABASE_URL
const describeDatabase = databaseUrl ? describe : describe.skip

type Mode = 'forward_after_approval' | 'forward_automatic'
type Attachment = {
  readonly bucket: string
  readonly contentType: string
  readonly fileName: string
  readonly key: string
  readonly provider: string
  readonly sha256: string
  readonly sizeBytes: number
}
type Seeded = {
  readonly companyId: string
  readonly replyId: string
  readonly threadId: string
}

function attachmentOf(contentType: string): Attachment {
  return {
    bucket: 'transportada-test',
    contentType,
    fileName: 'boleto',
    key: `occurrence-conversations/${crypto.randomUUID()}`,
    provider: 'minio',
    sha256: 'b'.repeat(64),
    sizeBytes: 2048,
  }
}

describeDatabase('a resposta por e-mail move o retorno da contratante (spec 248 T4.5)', () => {
  const provider = createDrizzleProvider({ connection: databaseUrl! })
  const database = provider.db
  const inbound = createDrizzleContractorMailInboundWorkerRepository(database)

  async function seedOccurrence(companyId: string, userId: string): Promise<string> {
    const vehicleId = crypto.randomUUID()
    await database.execute(
      sql`insert into user_company_memberships (id, user_id, company_id, status) values (${crypto.randomUUID()}, ${userId}, ${companyId}, 'active')`,
    )
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
      insert into nfe_documents (id, company_id, access_key, model, number, series, issued_at, operation_nature, operation_type, status, source, total_value, products_value, xml_object_id, xml_sha256, import_id, created_by_user_id, authorization_protocol)
      values (${documentId}, ${companyId}, ${accessKey}, '55', '1', '1', now(), 'venda', '1', 'authorized', 'upload', '10.00', '10.00', ${xmlObjectId}, ${'0'.repeat(64)}, ${importId}, ${userId}, 'protocol')`)
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

  async function seed(mode: Mode): Promise<Seeded> {
    const companyId = crypto.randomUUID()
    const userId = crypto.randomUUID()
    const contractorId = crypto.randomUUID()
    const threadId = crypto.randomUUID()
    const mailMessageId = crypto.randomUUID()
    const conversationId = crypto.randomUUID()
    const replyId = crypto.randomUUID()
    await database.execute(sql`insert into companies (id, status) values (${companyId}, 'active')`)
    await database.execute(
      sql`insert into identity_users (id, status) values (${userId}, 'active')`,
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
      values (${mailMessageId}, ${companyId}, ${threadId}, 'outbound', ${userId}, 'ocorrencias@transportadora.example.test', 'Ocorrência', array['compras@alfa.example.test'], 'Autorizam?', 'queued')`)
    await database.execute(sql`
      insert into occurrence_conversations (id, company_id, occurrence_kind, occurrence_id, participant, contractor_id, public_ref)
      values (${conversationId}, ${companyId}, 'document', ${occurrenceId}, 'contractor', ${contractorId}, ${`ref${crypto.randomUUID().replaceAll('-', '')}`})`)
    await database.execute(sql`
      insert into occurrence_conversation_messages (company_id, conversation_id, channel, direction, author_user_id, body_text, status, status_times, mail_message_id)
      values (${companyId}, ${conversationId}, 'email', 'outbound', ${userId}, 'Autorizam?', 'queued', '{"queued":"2026-09-24T12:00:00.000Z"}'::jsonb, ${mailMessageId})`)
    const config = JSON.stringify({ attachmentKind: 'pdf', mode, version: 1 })
    await database.execute(sql`
      insert into occurrence_contractor_replies (id, company_id, occurrence_id, conversation_id, config, status)
      values (${replyId}, ${companyId}, ${occurrenceId}, ${conversationId}, (${config}::text)::jsonb, 'awaiting_contractor')`)
    return { companyId, replyId, threadId }
  }

  function recordReply(
    seeded: Seeded,
    providerEmailId: string,
    conversationAttachments: readonly Attachment[],
  ) {
    return inbound.recordInboundMessage({
      bodyText: 'Segue o boleto.',
      companyId: seeded.companyId,
      conversationAttachments,
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

  async function replyOf(seeded: Seeded) {
    const rows = await database.execute(sql`
      select status, reason, reply_message_id is not null as has_message, reply_attachment_id is not null as has_attachment
      from occurrence_contractor_replies where company_id = ${seeded.companyId}`)
    return [...rows][0]
  }

  async function eventsOf(seeded: Seeded) {
    const rows = await database.execute(sql`
      select from_status, to_status, reason, actor_kind, actor_user_id
      from occurrence_contractor_reply_events where company_id = ${seeded.companyId} order by created_at`)
    return [...rows]
  }

  it('PDF com aprovação: awaiting_operator com o anexo e o evento do sistema; reentrega não repete', async () => {
    const seeded = await seed('forward_after_approval')
    const emailId = `re_${crypto.randomUUID()}`

    await recordReply(seeded, emailId, [attachmentOf('application/pdf')])
    await recordReply(seeded, emailId, [attachmentOf('application/pdf')])

    expect(await replyOf(seeded)).toEqual({
      has_attachment: true,
      has_message: true,
      reason: null,
      status: 'awaiting_operator',
    })
    expect(await eventsOf(seeded)).toEqual([
      {
        actor_kind: 'system',
        actor_user_id: null,
        from_status: 'awaiting_contractor',
        reason: null,
        to_status: 'awaiting_operator',
      },
    ])
  })

  it('PDF no modo automático: reply_received', async () => {
    const seeded = await seed('forward_automatic')

    await recordReply(seeded, `re_${crypto.randomUUID()}`, [attachmentOf('application/pdf')])

    expect((await replyOf(seeded))?.status).toBe('reply_received')
  })

  it('sem anexo aceito (só foto) e com dois PDFs: needs_operator com o motivo, sem anexo escolhido', async () => {
    const photo = await seed('forward_automatic')
    const two = await seed('forward_automatic')

    await recordReply(photo, `re_${crypto.randomUUID()}`, [attachmentOf('image/jpeg')])
    await recordReply(two, `re_${crypto.randomUUID()}`, [
      attachmentOf('application/pdf'),
      attachmentOf('application/pdf'),
    ])

    expect(await replyOf(photo)).toEqual({
      has_attachment: false,
      has_message: true,
      reason: 'no_accepted_attachment',
      status: 'needs_operator',
    })
    expect(await replyOf(two)).toEqual({
      has_attachment: false,
      has_message: true,
      reason: 'multiple_attachments',
      status: 'needs_operator',
    })
  })

  it('segunda resposta com retorno já respondido não muda nada', async () => {
    const seeded = await seed('forward_after_approval')

    await recordReply(seeded, `re_${crypto.randomUUID()}`, [attachmentOf('application/pdf')])
    await recordReply(seeded, `re_${crypto.randomUUID()}`, [attachmentOf('application/pdf')])

    expect((await replyOf(seeded))?.status).toBe('awaiting_operator')
    expect(await eventsOf(seeded)).toHaveLength(1)
  })

  it('CA09: resposta na thread da empresa B não move o retorno da A', async () => {
    const companyA = await seed('forward_after_approval')
    const companyB = await seed('forward_after_approval')

    await recordReply(companyB, `re_${crypto.randomUUID()}`, [attachmentOf('application/pdf')])

    expect((await replyOf(companyA))?.status).toBe('awaiting_contractor')
    expect((await replyOf(companyB))?.status).toBe('awaiting_operator')
    expect(await eventsOf(companyA)).toEqual([])
  })
})
