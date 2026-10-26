/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T3.2: as três tabelas do retorno contra a migration real — `handled` só com autor e nota,
 * `operator` só com ator, uma linha por ocorrência, uma chave de idempotência por empresa, eventos
 * append-only e a ocorrência que não some enquanto tiver retorno.
 */
import type { SQL } from 'bun'
import { expect } from 'bun:test'

import type { ContractorReplyFixture } from './occurrence-contractor-reply.fixture.js'
import { expectQueryToFail } from './support.js'

type Row = Record<string, number | string | null | object>

type Probe = Readonly<{
  companyId: string
  database: SQL
  fixture: ContractorReplyFixture
  userId: string
}>

const REPLIES = 'occurrence_contractor_replies'
const DELIVERIES = 'occurrence_contractor_reply_deliveries'
const EVENTS = 'occurrence_contractor_reply_events'

function insertRow(database: SQL, table: string, row: Row): PromiseLike<unknown> {
  return database`insert into ${database(table)} ${database(row)}`
}

function replyRow(probe: Probe, occurrenceId: string, patch: Row = {}): Row {
  return {
    company_id: probe.companyId,
    config: { version: 1 },
    conversation_id: probe.fixture.conversationId,
    id: crypto.randomUUID(),
    occurrence_id: occurrenceId,
    status: 'awaiting_contractor',
    ...patch,
  }
}

async function expectRejected(
  database: SQL,
  table: string,
  row: Row,
  constraint: string,
  sqlState: '23505' | '23514' = '23514',
): Promise<void> {
  await expectQueryToFail(insertRow(database, table, row), sqlState, `${table}_${constraint}`)
}

async function assertReplyConstraints(probe: Probe): Promise<string> {
  const { database, fixture, userId } = probe
  const other = (patch: Row): Row => replyRow(probe, fixture.otherOccurrenceId, patch)
  const rejected: readonly (readonly [string, Row])[] = [
    ['status_check', { status: 'archived' }],
    ['reason_check', { reason: 'no_accepted_attachment' }],
    ['reason_check', { reason: 'unknown_reason', status: 'needs_operator' }],
    ['config_check', { config: [] }],
    ['config_check', { config: {} }],
    ['alert_count_check', { alert_count: -1 }],
    ['handled_note_check', { handled_by_user_id: userId, handled_note: '', status: 'handled' }],
    [
      'handled_note_check',
      { handled_by_user_id: userId, handled_note: 'a'.repeat(501), status: 'handled' },
    ],
    ['handled_shape_check', { status: 'handled' }],
    ['handled_shape_check', { handled_by_user_id: userId, status: 'handled' }],
    ['handled_shape_check', { handled_note: 'Tratado', status: 'handled' }],
    ['handled_shape_check', { handled_by_user_id: userId, handled_note: 'Tratado' }],
  ]
  for (const [constraint, patch] of rejected) {
    await expectRejected(database, REPLIES, other(patch), constraint)
  }
  const accepted: readonly Row[] = [
    { reason: 'multiple_attachments', status: 'needs_operator' },
    { handled_by_user_id: userId, handled_note: 'a'.repeat(500), status: 'handled' },
  ]
  for (const patch of accepted) {
    const row = other(patch)
    await insertRow(database, REPLIES, row)
    await database`delete from ${database(REPLIES)} where id = ${row.id as string}`
  }

  const reply = replyRow(probe, fixture.occurrenceId)
  await insertRow(database, REPLIES, reply)
  await expectRejected(
    database,
    REPLIES,
    replyRow(probe, fixture.occurrenceId),
    'company_occurrence_unique',
    '23505',
  )
  return reply.id as string
}

async function assertDeliveryConstraints(probe: Probe, replyId: string): Promise<void> {
  const { companyId, database, fixture, userId } = probe
  const delivery = (patch: Row = {}): Row => ({
    attachment_id: fixture.attachmentId,
    company_id: companyId,
    id: crypto.randomUUID(),
    idempotency_key: `reply-248-${crypto.randomUUID()}`,
    reply_id: replyId,
    status: 'queued',
    target: 'driver_app_chat',
    trigger: 'automatic',
    ...patch,
  })
  const sentAt = '2026-10-09T12:00:00Z'
  const rejected: readonly (readonly [string, Row])[] = [
    ['target_check', { target: 'carrier_pigeon' }],
    ['trigger_check', { trigger: 'manual' }],
    ['status_check', { status: 'done' }],
    ['reason_check', { reason: 'unknown_reason' }],
    ['address_check', { address: 'someone@example.com' }],
    ['address_check', { address: `${'a'.repeat(250)}@x.com`, target: 'informed_email' }],
    ['sent_at_check', { status: 'sent' }],
    ['sent_at_check', { sent_at: sentAt }],
    ['actor_check', { trigger: 'operator' }],
    ['actor_check', { actor_user_id: userId }],
    ['idempotency_key_check', { idempotency_key: '' }],
  ]
  for (const [constraint, patch] of rejected) {
    await expectRejected(database, DELIVERIES, delivery(patch), constraint)
  }
  await insertRow(database, DELIVERIES, delivery({ actor_user_id: userId, trigger: 'operator' }))
  await insertRow(database, DELIVERIES, delivery({ sent_at: sentAt, status: 'sent' }))
  await insertRow(
    database,
    DELIVERIES,
    delivery({ address: 'someone@example.com', target: 'informed_email' }),
  )
  /** Spec 279 T3: o alvo do cadastro do cliente leva o endereço como os outros encaminhamentos. */
  await insertRow(
    database,
    DELIVERIES,
    delivery({ address: 'financeiro@mercado.com.br', target: 'client_boleto_emails' }),
  )

  const first = delivery({ idempotency_key: 'same-key-248' })
  await insertRow(database, DELIVERIES, first)
  await expectRejected(
    database,
    DELIVERIES,
    delivery({ idempotency_key: 'same-key-248' }),
    'idempotency_unique',
    '23505',
  )
}

async function assertEventConstraints(probe: Probe, replyId: string): Promise<void> {
  const { companyId, database, userId } = probe
  const event = (patch: Row = {}): Row => ({
    actor_kind: 'system',
    company_id: companyId,
    id: crypto.randomUUID(),
    reply_id: replyId,
    to_status: 'awaiting_contractor',
    ...patch,
  })
  const rejected: readonly (readonly [string, Row])[] = [
    ['from_status_check', { from_status: 'archived' }],
    ['to_status_check', { to_status: 'archived' }],
    ['reason_check', { reason: 'unknown_reason' }],
    ['actor_kind_check', { actor_kind: 'robot', actor_user_id: userId }],
    ['actor_check', { actor_user_id: userId }],
    ['actor_check', { actor_kind: 'user' }],
  ]
  for (const [constraint, patch] of rejected) {
    await expectRejected(database, EVENTS, event(patch), constraint)
  }
  const stored = event({ actor_kind: 'user', actor_user_id: userId })
  await insertRow(database, EVENTS, stored)

  const id = stored.id as string
  await expectQueryToFail(
    database`update ${database(EVENTS)} set to_status = 'cancelled' where id = ${id}`,
    '55000',
  )
  await expectQueryToFail(database`delete from ${database(EVENTS)} where id = ${id}`, '55000')
  const [untouched] =
    (await database`select to_status from ${database(EVENTS)} where id = ${id}`) as {
      to_status: string
    }[]
  expect(untouched?.to_status).toBe('awaiting_contractor')
}

export async function assertOccurrenceContractorReplyRows(probe: Probe): Promise<void> {
  const replyId = await assertReplyConstraints(probe)
  await assertDeliveryConstraints(probe, replyId)
  await assertEventConstraints(probe, replyId)
  await expectQueryToFail(
    probe.database`delete from trip_document_occurrences where id = ${probe.fixture.occurrenceId}`,
    '23503',
  )
  await expectQueryToFail(
    probe.database`delete from ${probe.database(REPLIES)} where id = ${replyId}`,
    '23503',
  )
}
