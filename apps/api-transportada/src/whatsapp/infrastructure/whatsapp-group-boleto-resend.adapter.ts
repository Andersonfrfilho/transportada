/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 292 T7: as portas do "pedir boleto de novo" no grupo. A lista sai dos pedidos fechados do grupo cuja chave
 * (`whatsapp-group-request:<id>`) abriu a ocorrência e cujo retorno ainda espera a contratante; o reenvio é o caso de
 * uso do painel (spec 248 RF6), em nome da conta do motorista do grupo. Recusa de negócio (fora do estado, cedo demais)
 * vira `not_resendable`; o resto vai a log sem nota nem texto.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { sql } from 'drizzle-orm'

import { ApiError } from '../../shared/api.error.js'
import type { ApiLogger } from '../../shared/api.types.js'
import type { GroupBoletoResendPorts } from '../application/whatsapp-group-boleto-resend.service.js'
import { findDriverUserId } from './whatsapp-group-occurrence.adapter.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

/** Os mesmos dias do retorno ao grupo: pedido mais antigo que isso não é mais assunto do grupo. */
const LOOKBACK_DAYS = 14

export function createGroupBoletoResendPorts(dependencies: {
  readonly clock?: () => Date
  readonly database: Database
  readonly logger: ApiLogger
  readonly resend: (input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly correlationId: string
    readonly idempotencyKey: string
    readonly occurrenceId: string
  }) => Promise<unknown>
}): GroupBoletoResendPorts {
  const { database } = dependencies
  return {
    async listPending({ companyId, groupJid }) {
      const now = dependencies.clock?.() ?? new Date()
      const since = new Date(now.getTime() - LOOKBACK_DAYS * 86_400_000).toISOString()
      const rows = (await database.execute(sql`
        select distinct on (reply.occurrence_id)
               reply.occurrence_id::text as occurrence_id,
               coalesce(nullif(request.state->>'documentNumber', ''), note.number, '') as document_number
          from whatsapp_group_requests request
          join trip_field_reports report
            on report.company_id = request.company_id
           and report.idempotency_key = 'whatsapp-group-request:' || request.id::text
           and report.result_id is not null
          join occurrence_contractor_replies reply
            on reply.company_id = report.company_id and reply.occurrence_id = report.result_id
          left join trip_document_occurrences occurrence
            on occurrence.company_id = reply.company_id and occurrence.id = reply.occurrence_id
          left join trip_documents document
            on document.company_id = occurrence.company_id and document.id = occurrence.trip_document_id
          left join nfe_documents note
            on note.company_id = document.company_id and note.id = document.nfe_document_id
         where request.company_id = ${companyId}::uuid
           and request.group_jid = ${groupJid}
           and request.status = 'completed'
           and request.opened_at >= ${since}::timestamptz
           and reply.status in ('awaiting_contractor', 'overdue')
         order by reply.occurrence_id, request.opened_at desc`)) as unknown as readonly Record<
        string,
        unknown
      >[]
      return rows.flatMap((row) =>
        typeof row.occurrence_id === 'string' && typeof row.document_number === 'string'
          ? [{ documentNumber: row.document_number, occurrenceId: row.occurrence_id }]
          : [],
      )
    },

    async resend(input) {
      const actorUserId = await findDriverUserId(database, input)
      if (actorUserId === null) return 'failed'
      try {
        await dependencies.resend({
          actorUserId,
          companyId: input.companyId,
          correlationId: crypto.randomUUID(),
          idempotencyKey: input.idempotencyKey,
          occurrenceId: input.occurrenceId,
        })
        return 'sent'
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) return 'not_resendable'
        dependencies.logger.warn('whatsapp_group_request.boleto_resend_failed', {
          companyId: input.companyId,
          errorName: error instanceof Error ? error.name : typeof error,
        })
        return 'failed'
      }
    },
  }
}
