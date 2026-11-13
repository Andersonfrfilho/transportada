/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 324 (T1): a reserva do botão "Avisar a contratante" e as duas perguntas que o botão e o automático fazem um ao
 * outro, tudo em `idempotency_records` (sem tabela nova nesta etapa; o registro próprio, a auditoria e a linha do tempo
 * são da T2).
 *
 * - Reserva (D3): operação `occurrence-contractor-manual-notice.send`, chave `occurrence-manual-notice:<id>`, numa
 *   instrução só, no molde da reserva do grupo da 318: a linha nova nasce `processing`; a `failed`, ou a `processing`
 *   parada há mais de 10 min (processo caiu no meio), é retomada; `completed` nunca.
 * - "O automático já avisou?" (D8): o e-mail automático gravou a idempotência dele (`occurrence-auto-mail:<id>` na
 *   operação do e-mail) ou o grupo da 318 fechou `completed` (no grupo ou na reserva por e-mail).
 * - "O manual já avisou?": a reserva do botão fechou `completed`. Só ids e o desfecho no `response`; nada de texto,
 *   endereço ou número.
 */
import { sql } from 'drizzle-orm'

import {
  AUTOMATIC_OCCURRENCE_MAIL_KEY_PREFIX,
  MANUAL_OCCURRENCE_NOTICE_KEY_PREFIX,
  type ManualContractorNoticePort,
} from '../application/send-automatic-occurrence-mail.use-case.js'
import { CONTRACTOR_OCCURRENCE_GROUP_SEND_OPERATION } from '../domain/contractor-occurrence-group.policy.js'
import {
  CONTRACTOR_MANUAL_NOTICE_OPERATION,
  SEND_OCCURRENCE_MAIL_OPERATION,
} from '../domain/occurrence-conversation.constant.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'

const STALE_PROCESSING_MINUTES = 10
/** A reserva não tem corpo de pedido para comparar: a impressão é fixa. */
const CLAIM_FINGERPRINT = 'manual'

export function createContractorManualNoticeRepository(dependencies: {
  readonly database: TripQueryable
}): ManualContractorNoticePort {
  const { database } = dependencies
  return {
    async claim({ companyId, occurrenceId }) {
      const rows = (await database.execute(
        sql`insert into idempotency_records
              (company_id, operation, idempotency_key, request_fingerprint, status, response)
            values (${companyId}::uuid, ${CONTRACTOR_MANUAL_NOTICE_OPERATION},
                    ${MANUAL_OCCURRENCE_NOTICE_KEY_PREFIX + occurrenceId}, ${CLAIM_FINGERPRINT},
                    'processing', '{}'::jsonb)
            on conflict (company_id, operation, idempotency_key) do update
              set status = 'processing', updated_at = now()
              where idempotency_records.status = 'failed'
                 or (idempotency_records.status = 'processing'
                     and idempotency_records.updated_at
                         < now() - make_interval(mins => ${STALE_PROCESSING_MINUTES}))
            returning 1 as claimed`,
      )) as unknown as readonly unknown[]
      return rows.length > 0
    },

    async isAutomaticNoticeSent({ companyId, occurrenceId }) {
      const key = AUTOMATIC_OCCURRENCE_MAIL_KEY_PREFIX + occurrenceId
      const rows = (await database.execute(
        sql`select 1 as sent
            from idempotency_records
            where company_id = ${companyId}::uuid
              and idempotency_key = ${key}
              and (operation = ${SEND_OCCURRENCE_MAIL_OPERATION}
                   or (operation = ${CONTRACTOR_OCCURRENCE_GROUP_SEND_OPERATION}
                       and status = 'completed'))
            limit 1`,
      )) as unknown as readonly unknown[]
      return rows.length > 0
    },

    async isManualNoticeSent({ companyId, occurrenceId }) {
      const rows = (await database.execute(
        sql`select 1 as sent
            from idempotency_records
            where company_id = ${companyId}::uuid
              and operation = ${CONTRACTOR_MANUAL_NOTICE_OPERATION}
              and idempotency_key = ${MANUAL_OCCURRENCE_NOTICE_KEY_PREFIX + occurrenceId}
              and status = 'completed'
            limit 1`,
      )) as unknown as readonly unknown[]
      return rows.length > 0
    },

    async record({ actorUserId, companyId, occurrenceId, result, status }) {
      await database.execute(
        sql`update idempotency_records
            set status = ${status === 'sent' ? 'completed' : 'failed'},
                response = ${JSON.stringify({
                  actorUserId,
                  outcome: result?.outcome ?? null,
                  reason: result !== null && 'reason' in result ? result.reason : null,
                  status,
                })}::jsonb,
                updated_at = now()
            where company_id = ${companyId}::uuid
              and operation = ${CONTRACTOR_MANUAL_NOTICE_OPERATION}
              and idempotency_key = ${MANUAL_OCCURRENCE_NOTICE_KEY_PREFIX + occurrenceId}`,
      )
    },
  }
}
