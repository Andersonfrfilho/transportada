/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T3.2: as linhas reais que as FKs compostas do retorno exigem — uma nota num documento de
 * viagem, uma ocorrência dela e, na conversa do motorista, um anexo.
 */
import type { SQL } from 'bun'

const ZERO_SHA256 = '0'.repeat(64)

export type ContractorReplyFixtureInput = Readonly<{
  companyId: string
  database: SQL
  tripId: string
  userId: string
}>

export type ContractorReplyFixture = Readonly<{
  attachmentId: string
  conversationId: string
  occurrenceId: string
  otherOccurrenceId: string
  typeId: string
}>

type IdSet = Record<
  | 'attachment'
  | 'conversation'
  | 'importId'
  | 'message'
  | 'nfe'
  | 'object'
  | 'occurrence'
  | 'otherOccurrence'
  | 'tripDocument'
  | 'type'
  | 'xmlObject',
  string
>

const ID_NAMES = [
  'attachment',
  'conversation',
  'importId',
  'message',
  'nfe',
  'object',
  'occurrence',
  'otherOccurrence',
  'tripDocument',
  'type',
  'xmlObject',
] as const

const createdIds = new Map<SQL, IdSet>()

function newIds(): IdSet {
  return Object.fromEntries(ID_NAMES.map((name) => [name, crypto.randomUUID()])) as IdSet
}

async function insertNote(input: ContractorReplyFixtureInput, ids: IdSet): Promise<void> {
  const { companyId, database, tripId, userId } = input
  const accessKey = '8'.repeat(44)
  await database`
    insert into stored_objects (
      id, company_id, provider, bucket, object_key, mime_type, size_bytes, sha256, status, purpose
    ) values
      (${ids.xmlObject}, ${companyId}, 's3', 'fiscal', ${`nfe/${ids.xmlObject}.xml`}, 'application/xml', 1024,
       ${ZERO_SHA256}, 'final', 'nfe_document'),
      (${ids.object}, ${companyId}, 's3', 'operational', ${`reply/${ids.object}.pdf`}, 'application/pdf', 1024,
       ${ZERO_SHA256}, 'final', 'delivery_proof')
  `
  await database`
    insert into nfe_imports (
      id, company_id, source, requested_by_user_id, correlation_id, idempotency_key, request_fingerprint, status
    ) values (
      ${ids.importId}, ${companyId}, 'upload', ${userId}, 'correlation-reply-248',
      'idem-reply-248', 'fingerprint-reply-248', 'completed'
    )
  `
  await database`
    insert into nfe_documents (
      id, company_id, access_key, model, number, series, issued_at, operation_nature, operation_type,
      status, source, total_value, products_value, authorization_protocol,
      xml_object_id, xml_sha256, import_id, created_by_user_id
    ) values (
      ${ids.nfe}, ${companyId}, ${accessKey}, '55', '2481', '1', now(), 'venda', '1',
      'authorized', 'upload', '1000.00', '1000.00', '135240002',
      ${ids.xmlObject}, ${ZERO_SHA256}, ${ids.importId}, ${userId}
    )
  `
  await database`
    insert into trip_documents (id, company_id, trip_id, nfe_document_id)
    values (${ids.tripDocument}, ${companyId}, ${tripId}, ${ids.nfe})
  `
}

async function insertOccurrencesAndConversation(
  input: ContractorReplyFixtureInput,
  ids: IdSet,
): Promise<void> {
  const { companyId, database, userId } = input
  await database`
    insert into company_occurrence_types (id, company_id, name, stage, items_mode, redelivery_policy)
    values (${ids.type}, ${companyId}, ${`Prova 248 ${ids.type}`}, 'delivery', 'off', 'unset')
  `
  await database`
    insert into trip_document_occurrences (id, company_id, trip_document_id, stage, occurrence_type_id, actor_user_id)
    values
      (${ids.occurrence}, ${companyId}, ${ids.tripDocument}, 'delivery', ${ids.type}, ${userId}),
      (${ids.otherOccurrence}, ${companyId}, ${ids.tripDocument}, 'delivery', ${ids.type}, ${userId})
  `
  await database`
    insert into occurrence_conversations (id, company_id, occurrence_kind, occurrence_id, participant, driver_user_id)
    values (${ids.conversation}, ${companyId}, 'document', ${ids.occurrence}, 'driver', ${userId})
  `
  await database`
    insert into occurrence_conversation_messages (id, company_id, conversation_id, channel, direction, author_user_id, status)
    values (${ids.message}, ${companyId}, ${ids.conversation}, 'app', 'outbound', ${userId}, 'sent')
  `
  await database`
    insert into occurrence_conversation_attachments (
      id, company_id, message_id, stored_object_id, sha256, size_bytes, content_type
    ) values (${ids.attachment}, ${companyId}, ${ids.message}, ${ids.object}, ${ZERO_SHA256}, 1024, 'application/pdf')
  `
}

export async function createContractorReplyFixture(
  input: ContractorReplyFixtureInput,
): Promise<ContractorReplyFixture> {
  const ids = newIds()
  createdIds.set(input.database, ids)
  await insertNote(input, ids)
  await insertOccurrencesAndConversation(input, ids)
  return {
    attachmentId: ids.attachment,
    conversationId: ids.conversation,
    occurrenceId: ids.occurrence,
    otherOccurrenceId: ids.otherOccurrence,
    typeId: ids.type,
  }
}

/** Deixa o banco como estava, para o rollback (que recusa com retorno gravado) e os testes seguintes. */
export async function removeContractorReplyFixture(
  input: ContractorReplyFixtureInput,
): Promise<void> {
  const { companyId, database } = input
  const ids = createdIds.get(database)
  if (ids === undefined) return
  createdIds.delete(database)
  // TRUNCATE não dispara o trigger append-only dos eventos.
  await database`
    truncate occurrence_contractor_reply_events, occurrence_contractor_reply_deliveries,
      occurrence_contractor_replies
  `
  await database`delete from occurrence_conversation_attachments where id = ${ids.attachment}`
  await database`delete from occurrence_conversation_messages where id = ${ids.message}`
  await database`delete from occurrence_conversations where id = ${ids.conversation}`
  await database`delete from trip_document_occurrences where company_id = ${companyId} and trip_document_id = ${ids.tripDocument}`
  await database`delete from company_occurrence_types where company_id = ${companyId} and name like ${'Prova 248 %'}`
  await database`delete from trip_documents where id = ${ids.tripDocument}`
  await database`delete from nfe_documents where id = ${ids.nfe}`
  await database`delete from nfe_imports where id = ${ids.importId}`
  await database`delete from stored_objects where id in (${ids.xmlObject}, ${ids.object})`
}
