/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF5: o alerta do retorno vencido, numa transação. Toda leitura e escrita leva `company_id`.
 * Nenhum log aqui: o contato da contratante, o anexo e o número da nota nunca saem do banco, a não ser
 * como rótulo do aviso.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import {
  decideAlert,
  type ContractorReplyAlertInput,
} from '../../occurrence-conversation/domain/contractor-reply.policy.js'
import {
  CONTRACTOR_REPLY_ALERT_MODES,
  type ContractorReplyStatus,
} from '../../shared/occurrence-contractor-reply.constant.js'
import type {
  ApplyContractorReplyAlertParams,
  ApplyContractorReplyAlertResult,
  ContractorReplyAlertRecipient,
  OccurrenceContractorReplyAlertStorePort,
} from '../application/occurrence-contractor-reply-alert.port.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0]

type ReplyRow = Readonly<{
  alert_count: number
  config: unknown
  deadline_at: Date | string | null
  id: string
  last_alert_at: Date | string | null
  occurrence_id: string
  status: ContractorReplyStatus
}>

type RecipientRow = Readonly<{
  invoice_number: string | null
  invoice_series: string | null
  recipient_user_id: string | null
  type_name: string
}>

type AlertConfig = ContractorReplyAlertInput['reply']['config']

function toDate(value: Date | string | null): Date | null {
  if (value === null) return null
  return value instanceof Date ? value : new Date(value)
}

function readAlertConfig(raw: unknown): AlertConfig | undefined {
  const value = typeof raw === 'string' ? (JSON.parse(raw) as unknown) : raw
  if (typeof value !== 'object' || value === null) return undefined
  const { alertIntervalMinutes, alertMaxCount, alertMode } = value as Record<string, unknown>
  if (typeof alertIntervalMinutes !== 'number' || typeof alertMaxCount !== 'number') {
    return undefined
  }
  const knownMode = CONTRACTOR_REPLY_ALERT_MODES.find((mode) => mode === alertMode)
  if (knownMode === undefined) return undefined
  return { alertIntervalMinutes, alertMaxCount, alertMode: knownMode }
}

/** A nota, ou o tipo quando a ocorrência não tem nota: a mesma regra do aviso à contratante e ao motorista. */
function describeOccurrenceLabel(row: RecipientRow): string {
  if (row.invoice_number === null || row.invoice_number === '') return row.type_name
  return row.invoice_series === null || row.invoice_series === ''
    ? `NF ${row.invoice_number}`
    : `NF ${row.invoice_number}/${row.invoice_series}`
}

async function findPendingWindowSince(
  transaction: Transaction,
  params: ApplyContractorReplyAlertParams,
): Promise<Date | null> {
  const rows = (await transaction.execute(sql`
    select min(d."created_at") as since
    from occurrence_contractor_reply_deliveries d
    where d."company_id" = ${params.companyId}::uuid
      and d."reply_id" = ${params.replyId}::uuid
      and d."status" = 'pending_window'
  `)) as unknown as readonly { since: Date | string | null }[]
  return toDate(rows[0]?.since ?? null)
}

async function findRecipient(
  transaction: Transaction,
  params: { readonly companyId: string; readonly occurrenceId: string },
): Promise<ContractorReplyAlertRecipient | null> {
  const rows = (await transaction.execute(sql`
    select
      dispatch."actor_user_id" as recipient_user_id,
      t."name" as type_name,
      n."number" as invoice_number,
      n."series" as invoice_series
    from trip_document_occurrences o
    join company_occurrence_types t
      on t."company_id" = o."company_id" and t."id" = o."occurrence_type_id"
    left join trip_documents d on d."company_id" = o."company_id" and d."id" = o."trip_document_id"
    left join nfe_documents n on n."company_id" = o."company_id" and n."id" = d."nfe_document_id"
    left join lateral (
      select ds."actor_user_id"
      from trip_dispatch_snapshots ds
      where ds."company_id" = o."company_id" and ds."trip_id" = d."trip_id"
      order by ds."dispatched_at" desc
      limit 1
    ) dispatch on true
    where o."company_id" = ${params.companyId}::uuid and o."id" = ${params.occurrenceId}::uuid
  `)) as unknown as readonly RecipientRow[]
  const [row] = rows
  if (row === undefined || row.recipient_user_id === null) return null
  return { occurrenceLabel: describeOccurrenceLabel(row), recipientUserId: row.recipient_user_id }
}

async function applyAlertInTransaction(
  transaction: Transaction,
  params: ApplyContractorReplyAlertParams,
): Promise<ApplyContractorReplyAlertResult> {
  const { companyId, now, replyId } = params
  const [reply] = (await transaction.execute(sql`
    select r."id", r."occurrence_id", r."status", r."config", r."deadline_at", r."alert_count", r."last_alert_at"
    from occurrence_contractor_replies r
    where r."company_id" = ${companyId}::uuid and r."id" = ${replyId}::uuid
    for update
  `)) as unknown as readonly ReplyRow[]
  if (reply === undefined) return { kind: 'skipped', reason: 'not_found' }

  const config = readAlertConfig(reply.config)
  if (config === undefined) return { kind: 'skipped', reason: 'invalid_configuration' }

  const decision = decideAlert({
    now,
    pendingWindowSince:
      reply.status === 'reply_received' ? await findPendingWindowSince(transaction, params) : null,
    reply: {
      alertCount: Number(reply.alert_count),
      config,
      deadlineAt: toDate(reply.deadline_at),
      lastAlertAt: toDate(reply.last_alert_at),
      status: reply.status,
    },
  })
  if (decision.kind === 'none') return { kind: 'skipped', reason: decision.reason }

  const toStatus: ContractorReplyStatus = decision.becomesOverdue ? 'overdue' : reply.status
  const moved = (await transaction.execute(sql`
    update occurrence_contractor_replies
    set "status" = ${toStatus},
        "alert_count" = "alert_count" + 1,
        "last_alert_at" = ${now.toISOString()}::timestamptz,
        "updated_at" = ${now.toISOString()}::timestamptz
    where "company_id" = ${companyId}::uuid
      and "id" = ${replyId}::uuid
      and "alert_count" = ${Number(reply.alert_count)}
      and "status" = ${reply.status}
    returning "id"
  `)) as unknown as readonly { id: string }[]
  if (moved.length === 0) return { kind: 'skipped', reason: 'conflict' }

  await transaction.execute(sql`
    insert into occurrence_contractor_reply_events
      ("company_id", "reply_id", "from_status", "to_status", "reason", "actor_kind")
    values (${companyId}::uuid, ${replyId}::uuid, ${reply.status}, ${toStatus}, null, 'system')
  `)

  return {
    alertNumber: decision.alertNumber,
    becomesOverdue: decision.becomesOverdue,
    kind: 'alerted',
    recipient: await findRecipient(transaction, { companyId, occurrenceId: reply.occurrence_id }),
  }
}

export function createDrizzleOccurrenceContractorReplyAlertStore(
  database: Database,
): OccurrenceContractorReplyAlertStorePort {
  return {
    applyAlert: (params) =>
      database.transaction((transaction) => applyAlertInTransaction(transaction, params)),
  }
}
