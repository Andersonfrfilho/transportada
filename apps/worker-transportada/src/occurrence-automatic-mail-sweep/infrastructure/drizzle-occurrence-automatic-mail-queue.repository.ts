/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import type {
  ListPendingAutomaticMailParams,
  OccurrenceAutomaticMailQueuePort,
} from '../application/occurrence-automatic-mail-queue.port.js'
import {
  OCCURRENCE_AUTOMATIC_MAIL_KEY_PREFIX,
  OCCURRENCE_AUTOMATIC_MAIL_SEND_OPERATION,
} from '../domain/occurrence-automatic-mail-sweep.constant.js'

export type OccurrenceAutomaticMailDatabase = ReturnType<typeof createDrizzleProvider>['db']

type PendingRow = Readonly<{ company_id: string; occurrence_id: string }>

/**
 * A contratante é a emitente da nota casada pelo CNPJ dentro da mesma empresa — a mesma ligação que a
 * API usa para decidir o destinatário. Sem contratante a API pularia e o varredor revisitaria a
 * ocorrência a cada batida até a janela fechar, por isso ela é exigida aqui.
 */
export function createDrizzleOccurrenceAutomaticMailQueue(
  database: OccurrenceAutomaticMailDatabase,
): OccurrenceAutomaticMailQueuePort {
  return {
    async listPending(params: ListPendingAutomaticMailParams) {
      const exclusion =
        params.excludeOccurrenceIds.length === 0
          ? sql``
          : sql`and o."id" not in (${sql.join(
              params.excludeOccurrenceIds.map((occurrenceId) => sql`${occurrenceId}::uuid`),
              sql`, `,
            )})`

      const rows = (await database.execute(sql`
        select o."id" as occurrence_id, o."company_id" as company_id
        from trip_document_occurrences o
        join company_occurrence_types t
          on t."id" = o."occurrence_type_id" and t."company_id" = o."company_id"
        join trip_documents d on d."id" = o."trip_document_id" and d."company_id" = o."company_id"
        where t."emails_contractor" = true
          and o."stage" in ('delivery', 'separation')
          and o."cancelled_at" is null
          and o."created_at" <= ${params.createdBefore.toISOString()}::timestamptz
          and o."created_at" > ${params.createdAfter.toISOString()}::timestamptz
          and exists (
            select 1
            from nfe_participants p
            join contractors c on c."company_id" = p."company_id" and c."tax_id" = p."tax_id"
            where p."document_id" = d."nfe_document_id"
              and p."company_id" = o."company_id"
              and p."role" = 'emitter'
          )
          and not exists (
            select 1
            from idempotency_records r
            where r."company_id" = o."company_id"
              and r."operation" = ${OCCURRENCE_AUTOMATIC_MAIL_SEND_OPERATION}
              and r."idempotency_key" = ${OCCURRENCE_AUTOMATIC_MAIL_KEY_PREFIX} || o."id"::text
          )
          ${exclusion}
        order by o."created_at"
        limit ${params.limit}
      `)) as unknown as readonly PendingRow[]

      return rows.map((row) => ({ companyId: row.company_id, occurrenceId: row.occurrence_id }))
    },
  }
}
