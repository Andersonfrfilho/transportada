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
  HTML_BODY_PATTERN,
  NOTIFICATION_SCHEMA,
  OCCURRENCE_AUTOMATIC_MAIL_KEY_PREFIX,
  OCCURRENCE_AUTOMATIC_MAIL_SEND_OPERATION,
  OCCURRENCE_CONTRACTOR_MAIL_CHANNEL,
  OCCURRENCE_CONTRACTOR_MAIL_LOCALE,
  UNSAFE_EMAIL_HTML_PATTERN,
} from '../domain/occurrence-automatic-mail-sweep.constant.js'

export type OccurrenceAutomaticMailDatabase = ReturnType<typeof createDrizzleProvider>['db']

type PendingRow = Readonly<{ company_id: string; occurrence_id: string }>

/**
 * A contratante é a emitente da nota casada pelo CNPJ dentro da mesma empresa — a mesma ligação que a
 * API usa para decidir o destinatário. Sem contratante a API pularia e o varredor revisitaria a
 * ocorrência a cada batida até a janela fechar, por isso ela é exigida aqui.
 *
 * Spec 271: o mesmo vale para o modelo de e-mail — a chave que o tipo escolheu precisa ter, no módulo de notificação,
 * a versão ativa mais alta utilizável (e-mail `pt-BR`, assunto preenchido, corpo sem HTML inseguro — spec 272). Sem modelo utilizável a API
 * pula (`no_template_selected`, sem gravar idempotência), e o varredor a repetiria a cada batida; a fila só pede
 * ocorrência que o envio pode atender.
 *
 * Só as registradas depois da escolha (decisão de 2026-10-17): vale o carimbo da escolha da chave no tipo, o mesmo
 * critério da API (`registered_before_template`).
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
          and t."contractor_notification_template_key" is not null
          and o."created_at" >= coalesce(
            t."contractor_notification_template_selected_at",
            '-infinity'::timestamptz
          )
          and exists (
            select 1
            from ${sql.identifier(NOTIFICATION_SCHEMA)}."templates" nt
            where nt."company_id" = o."company_id"
              and nt."key" = t."contractor_notification_template_key"
              and nt."channel" = ${OCCURRENCE_CONTRACTOR_MAIL_CHANNEL}
              and nt."locale" = ${OCCURRENCE_CONTRACTOR_MAIL_LOCALE}
              and nt."active"
              and nt."version" = (
                select max(latest."version")
                from ${sql.identifier(NOTIFICATION_SCHEMA)}."templates" latest
                where latest."company_id" = nt."company_id"
                  and latest."key" = nt."key"
                  and latest."channel" = nt."channel"
                  and latest."locale" = nt."locale"
                  and latest."active"
              )
              and btrim(coalesce(nt."subject", '')) <> ''
              and (nt."body" !~ ${HTML_BODY_PATTERN} or nt."body" !~* ${UNSAFE_EMAIL_HTML_PATTERN})
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
