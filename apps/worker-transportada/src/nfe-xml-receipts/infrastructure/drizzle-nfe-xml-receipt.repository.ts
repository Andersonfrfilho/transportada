/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 301: a fila de recibos em SQL. `claimPending` usa `for update skip locked`, então dois workers nunca pegam o mesmo
 * recibo; o resumo só sai quando a importação terminou de verdade (o recibo `imported` quer dizer "importação criada").
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type {
  ReceiptRecord,
  ReceiptRepositoryPort,
  ReceiptSummaryRepositoryPort,
  ReceiptSummaryRow,
  WhatsAppReceiptMedia,
} from '../application/nfe-xml-receipt.types.js'
import { NFE_IMPORT_ROLES } from '../domain/nfe-xml-receipt.constant.js'
import type { NfeXmlReceiptRejection } from '../domain/nfe-xml-receipt.constant.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']
type Rows<T> = readonly T[]

const FINISHED_IMPORT_STATUSES = sql`('completed', 'partially_processed', 'failed')`

type ReceiptRow = {
  attempts: number
  channel: ReceiptRecord['channel']
  company_id: string
  id: string
  media: WhatsAppReceiptMedia | null
  provider_message_id: string
  reply_to: string | null
  requested_by_user_id: string | null
  sender: string
}

type SummaryRow = {
  channel: ReceiptSummaryRow['channel']
  company_id: string
  duplicated: number | null
  failed: number | null
  id: string
  imported: number | null
  invalid: number | null
  problems: { code: string; count: number }[] | null
  received: number | null
  reject_reason: NfeXmlReceiptRejection | null
  rejected: number | null
  reply_to: string | null
  sender: string
  status: ReceiptSummaryRow['status']
}

export function createDrizzleNfeXmlReceiptRepository(dependencies: {
  readonly database: Database
}): ReceiptRepositoryPort & ReceiptSummaryRepositoryPort {
  const { database } = dependencies
  const rolesList = sql.join(
    NFE_IMPORT_ROLES.map((role) => sql`${role}`),
    sql`, `,
  )

  return {
    async claimPending({ limit, now }) {
      const rows = (await database.execute(sql`
        update nfe_xml_receipts r
        set status = 'processing', attempts = r.attempts + 1, updated_at = ${now.toISOString()}::timestamptz
        where r.id in (
          select id from nfe_xml_receipts
          where status = 'pending' and channel = 'whatsapp'
            and next_attempt_at <= ${now.toISOString()}::timestamptz
          order by next_attempt_at, created_at
          limit ${limit}
          for update skip locked
        )
        returning r.id, r.company_id, r.channel, r.provider_message_id, r.sender, r.requested_by_user_id,
                  r.reply_to, r.media, r.attempts
      `)) as unknown as Rows<ReceiptRow>
      return rows.map(toRecord)
    },

    async releaseStale({ now, staleSeconds }) {
      const rows = (await database.execute(sql`
        update nfe_xml_receipts
        set status = 'pending', updated_at = ${now.toISOString()}::timestamptz
        where status = 'processing'
          and updated_at < ${now.toISOString()}::timestamptz - make_interval(secs => ${staleSeconds})
        returning id
      `)) as unknown as Rows<unknown>
      return rows.length
    },

    async discardReceipt({ receiptId }) {
      await database.execute(sql`
        delete from nfe_xml_receipts where id = ${receiptId}::uuid and status in ('pending', 'processing')
      `)
    },

    async findAuthorizedSenderByEmail({ companyId, email }) {
      const rows = (await database.execute(sql`
        select m.user_id
        from user_company_memberships m
        join identity_user_profiles p on p.user_id = m.user_id
        where m.company_id = ${companyId}::uuid
          and m.status = 'active'
          and p.contact_channel = 'email'
          and lower(p.contact_address) = ${email.toLowerCase()}
          and exists (
            select 1 from membership_roles mr
            where mr.membership_id = m.id and mr.role in (${rolesList})
          )
        limit 1
      `)) as unknown as Rows<{ user_id: string }>
      const [row] = rows
      return row === undefined ? undefined : { userId: row.user_id }
    },

    async markAcknowledged({ now, receiptId }) {
      await database.execute(sql`
        update nfe_xml_receipts
        set acknowledged_at = ${now.toISOString()}::timestamptz, updated_at = ${now.toISOString()}::timestamptz
        where id = ${receiptId}::uuid
      `)
    },

    async markFailed({ errorCode, now, receiptId }) {
      await database.execute(sql`
        update nfe_xml_receipts
        set status = 'failed', last_error_code = ${errorCode}, updated_at = ${now.toISOString()}::timestamptz
        where id = ${receiptId}::uuid
      `)
    },

    async markRejected({ now, reason, receiptId }) {
      await database.execute(sql`
        update nfe_xml_receipts
        set status = 'rejected', reject_reason = ${reason}, updated_at = ${now.toISOString()}::timestamptz
        where id = ${receiptId}::uuid
      `)
    },

    async recordReceipt(input) {
      const rows = (await database.execute(sql`
        insert into nfe_xml_receipts
          (company_id, channel, provider_message_id, sender, requested_by_user_id, reply_to, status, reject_reason,
           created_at, updated_at, next_attempt_at)
        values
          (${input.companyId}::uuid, ${input.channel}, ${input.providerMessageId}, ${input.sender},
           ${input.requestedByUserId ?? null}::uuid, ${input.replyTo ?? null}, ${input.status},
           ${input.rejectReason ?? null}, ${input.now.toISOString()}::timestamptz,
           ${input.now.toISOString()}::timestamptz, ${input.now.toISOString()}::timestamptz)
        on conflict (company_id, channel, provider_message_id) do nothing
        returning id
      `)) as unknown as Rows<{ id: string }>
      const [created] = rows
      if (created !== undefined) return { created: true, receiptId: created.id }
      const existing = (await database.execute(sql`
        select id from nfe_xml_receipts
        where company_id = ${input.companyId}::uuid and channel = ${input.channel}
          and provider_message_id = ${input.providerMessageId}
      `)) as unknown as Rows<{ id: string }>
      return { created: false, receiptId: existing[0]?.id ?? '' }
    },

    async scheduleRetry({ errorCode, nextAttemptAt, receiptId }) {
      await database.execute(sql`
        update nfe_xml_receipts
        set status = 'pending', last_error_code = ${errorCode},
            next_attempt_at = ${nextAttemptAt.toISOString()}::timestamptz, updated_at = now()
        where id = ${receiptId}::uuid
      `)
    },

    async findSummariesToSend({ limit, maxAttempts }) {
      const rows = (await database.execute(sql`
        select r.id, r.company_id, r.channel, r.sender, r.reply_to, r.status, r.reject_reason,
               i.received_count::int as received, i.imported_count::int as imported,
               i.duplicated_count::int as duplicated, i.invalid_count::int as invalid,
               i.rejected_count::int as rejected, i.failed_count::int as failed,
               (
                 select coalesce(jsonb_agg(jsonb_build_object('code', g.code, 'count', g.n)), '[]'::jsonb)
                 from (
                   select it.error ->> 'code' as code, count(*)::int as n
                   from nfe_import_items it
                   where it.import_id = r.import_id and it.company_id = r.company_id
                     and it.error ->> 'code' is not null
                   group by 1 order by 2 desc limit 10
                 ) g
               ) as problems
        from nfe_xml_receipts r
        left join nfe_imports i on i.id = r.import_id and i.company_id = r.company_id
        where r.summary_sent_at is null and r.summary_attempts < ${maxAttempts}
          and (
            r.status in ('rejected', 'failed')
            or (r.status = 'imported' and i.status in ${FINISHED_IMPORT_STATUSES})
          )
        order by r.updated_at
        limit ${limit}
      `)) as unknown as Rows<SummaryRow>
      return rows.map(toSummary)
    },

    async markSummaryAttempt({ receiptId }) {
      await database.execute(sql`
        update nfe_xml_receipts set summary_attempts = summary_attempts + 1, updated_at = now()
        where id = ${receiptId}::uuid
      `)
    },

    async markSummarySent({ now, receiptId }) {
      await database.execute(sql`
        update nfe_xml_receipts
        set summary_sent_at = ${now.toISOString()}::timestamptz, updated_at = ${now.toISOString()}::timestamptz
        where id = ${receiptId}::uuid
      `)
    },
  }
}

function toRecord(row: ReceiptRow): ReceiptRecord {
  return {
    attempts: row.attempts,
    channel: row.channel,
    companyId: row.company_id,
    id: row.id,
    media: row.media,
    providerMessageId: row.provider_message_id,
    replyTo: row.reply_to,
    requestedByUserId: row.requested_by_user_id,
    sender: row.sender,
  }
}

function toSummary(row: SummaryRow): ReceiptSummaryRow {
  return {
    channel: row.channel,
    companyId: row.company_id,
    counts:
      row.received === null
        ? null
        : {
            duplicated: row.duplicated ?? 0,
            failed: row.failed ?? 0,
            imported: row.imported ?? 0,
            invalid: row.invalid ?? 0,
            received: row.received,
            rejected: row.rejected ?? 0,
          },
    id: row.id,
    problems: row.problems ?? [],
    rejectReason: row.reject_reason,
    replyTo: row.reply_to,
    sender: row.sender,
    status: row.status,
  }
}
