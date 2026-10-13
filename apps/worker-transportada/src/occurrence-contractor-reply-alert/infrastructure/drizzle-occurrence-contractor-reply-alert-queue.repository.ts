/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type {
  ListDueContractorRepliesParams,
  OccurrenceContractorReplyAlertQueuePort,
} from '../application/occurrence-contractor-reply-alert.port.js'

export type OccurrenceContractorReplyAlertDatabase = ReturnType<typeof createDrizzleProvider>['db']

type DueRow = Readonly<{ company_id: string; reply_id: string }>

/**
 * Pré-filtro da mesma regra de `decideAlert` (a política decide de verdade dentro da transação): o
 * retorno que ainda espera a contratante desde o prazo, ou a resposta recebida cuja entrega espera a
 * janela do motorista, com o alarme ligado, abaixo do teto e com o intervalo cumprido.
 */
export function createDrizzleOccurrenceContractorReplyAlertQueue(
  database: OccurrenceContractorReplyAlertDatabase,
): OccurrenceContractorReplyAlertQueuePort {
  return {
    async listDue(params: ListDueContractorRepliesParams) {
      const now = sql`${params.now.toISOString()}::timestamptz`
      const exclusion =
        params.excludeReplyIds.length === 0
          ? sql``
          : sql`and r."id" not in (${sql.join(
              params.excludeReplyIds.map((replyId) => sql`${replyId}::uuid`),
              sql`, `,
            )})`

      const rows = (await database.execute(sql`
        select r."id" as reply_id, r."company_id" as company_id
        from occurrence_contractor_replies r
        cross join lateral (
          select
            case when jsonb_typeof(r."config" -> 'alertMaxCount') = 'number'
              then (r."config" ->> 'alertMaxCount')::int end as max_count,
            case when jsonb_typeof(r."config" -> 'alertIntervalMinutes') = 'number'
              then (r."config" ->> 'alertIntervalMinutes')::int end as interval_minutes
        ) c
        left join lateral (
          select min(d."created_at") as since
          from occurrence_contractor_reply_deliveries d
          where d."company_id" = r."company_id"
            and d."reply_id" = r."id"
            and d."status" = 'pending_window'
        ) w on true
        cross join lateral (
          select case
            when r."status" in ('awaiting_contractor', 'overdue') then r."deadline_at"
            when r."status" = 'reply_received' then w.since
          end as starts_at
        ) s
        where r."status" in ('awaiting_contractor', 'overdue', 'reply_received')
          and r."config" ->> 'alertMode' = 'alert_operator'
          and c.max_count is not null
          and c.interval_minutes is not null
          and r."alert_count" < c.max_count
          and s.starts_at is not null
          and s.starts_at <= ${now}
          and (
            r."alert_count" = 0
            or coalesce(r."last_alert_at", s.starts_at) + make_interval(mins => c.interval_minutes)
              <= ${now}
          )
          ${exclusion}
        order by s.starts_at, r."id"
        limit ${params.limit}
      `)) as unknown as readonly DueRow[]

      return rows.map((row) => ({ companyId: row.company_id, replyId: row.reply_id }))
    },
  }
}
