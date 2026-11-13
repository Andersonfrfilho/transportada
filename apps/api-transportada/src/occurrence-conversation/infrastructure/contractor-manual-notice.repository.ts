/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 324 (T1): a reserva do botão "Avisar a contratante" e as duas perguntas que o botão e o automático fazem um ao
 * outro, em `idempotency_records`. Spec 324 (T2): ao fechar a reserva, o clique vira linha de
 * `occurrence_contractor_manual_notices` (quem, quando, canal, desfecho — a fonte da linha do tempo) e de `audit_logs`,
 * na mesma instrução.
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
  describeManualNoticeAttempt,
  type ManualNoticeChannel,
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

/** Spec 324 T2: a trilha do clique em `audit_logs` (sem texto, endereço, grupo nem número). */
export const CONTRACTOR_MANUAL_NOTICE_AUDIT_ACTION = 'occurrence.contractor-notice.manual'
const CONTRACTOR_MANUAL_NOTICE_AUDIT_ENTITY = 'trip_document_occurrence'
const CONTRACTOR_MANUAL_NOTICE_AUDIT_PERMISSION = 'occurrences.resolve'
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

    async readNoticeRecord({ companyId, occurrenceId }) {
      const manualRows = (await database.execute(
        sql`select n.created_at as at, n.channel as channel, p.name as actor_name
            from occurrence_contractor_manual_notices n
            left join identity_user_profiles p on p.user_id = n.actor_user_id
            where n.company_id = ${companyId}::uuid
              and n.occurrence_id = ${occurrenceId}::uuid
              and n.status = 'sent'
            order by n.created_at desc
            limit 1`,
      )) as unknown as readonly {
        readonly actor_name: null | string
        readonly at: Date | string
        readonly channel: ManualNoticeChannel | null
      }[]
      const automaticRows = (await database.execute(
        sql`select operation, updated_at as at
            from idempotency_records
            where company_id = ${companyId}::uuid
              and idempotency_key = ${AUTOMATIC_OCCURRENCE_MAIL_KEY_PREFIX + occurrenceId}
              and (operation = ${SEND_OCCURRENCE_MAIL_OPERATION}
                   or (operation = ${CONTRACTOR_OCCURRENCE_GROUP_SEND_OPERATION}
                       and status = 'completed'))
            order by updated_at desc
            limit 1`,
      )) as unknown as readonly { readonly at: Date | string; readonly operation: string }[]
      const manual = manualRows[0]
      const automatic = automaticRows[0]
      return {
        automatic:
          automatic === undefined
            ? null
            : {
                at: new Date(automatic.at).toISOString(),
                channel:
                  automatic.operation === CONTRACTOR_OCCURRENCE_GROUP_SEND_OPERATION
                    ? 'whatsapp_group'
                    : 'email',
              },
        manual:
          manual === undefined
            ? null
            : {
                actorName: manual.actor_name,
                at: new Date(manual.at).toISOString(),
                channel: manual.channel,
              },
      }
    },

    async record({ actorUserId, companyId, correlationId, occurrenceId, result, status }) {
      const { channel, reason } = describeManualNoticeAttempt({ result, status })
      const outcome = result?.outcome ?? null
      /**
       * Spec 324 T2: uma instrução só fecha a reserva, grava o clique e a auditoria — os três ou nenhum. A reserva é
       * da linha que o `claim` deixou `processing`; sem ela (nunca deveria) nada é gravado.
       */
      await database.execute(
        sql`with closed as (
              update idempotency_records
              set status = ${status === 'sent' ? 'completed' : 'failed'},
                  response = ${JSON.stringify({ actorUserId, outcome, reason, status })}::jsonb,
                  updated_at = now()
              where company_id = ${companyId}::uuid
                and operation = ${CONTRACTOR_MANUAL_NOTICE_OPERATION}
                and idempotency_key = ${MANUAL_OCCURRENCE_NOTICE_KEY_PREFIX + occurrenceId}
              returning company_id
            ),
            notice as (
              insert into occurrence_contractor_manual_notices
                (company_id, occurrence_id, actor_user_id, status, channel, outcome, reason)
              select company_id, ${occurrenceId}::uuid, ${actorUserId}::uuid, ${status},
                     ${channel}, ${outcome}, ${reason}
              from closed
              returning id
            )
            insert into audit_logs
              (company_id, actor_user_id, action, entity_type, entity_id, permission, target_type,
               target_id, correlation_id, metadata)
            select ${companyId}::uuid, ${actorUserId}::uuid, ${CONTRACTOR_MANUAL_NOTICE_AUDIT_ACTION},
                   ${CONTRACTOR_MANUAL_NOTICE_AUDIT_ENTITY}, ${occurrenceId}::uuid,
                   ${CONTRACTOR_MANUAL_NOTICE_AUDIT_PERMISSION}, ${CONTRACTOR_MANUAL_NOTICE_AUDIT_ENTITY},
                   ${occurrenceId}::uuid, ${correlationId},
                   jsonb_build_object('noticeId', notice.id, 'status', ${status}::text,
                                      'channel', ${channel}::text, 'outcome', ${outcome}::text,
                                      'reason', ${reason}::text)
            from notice`,
      )
    },
  }
}
