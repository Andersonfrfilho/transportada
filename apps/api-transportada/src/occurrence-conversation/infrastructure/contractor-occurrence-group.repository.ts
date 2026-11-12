/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 318: as leituras e a gravação do aviso automático no grupo da contratante.
 *
 * - O canal é a linha de `contractor_occurrence_channels` (sem linha, e-mail). O grupo e o número nunca saem daqui
 *   para log.
 * - A reserva e o resultado ficam em `idempotency_records` (operação `occurrence-contractor-group.send`, chave
 *   `occurrence-auto-mail:<id>`, a mesma do e-mail, RF3), numa instrução só: a linha nova nasce `processing`; a que
 *   terminou `failed`, ou ficou `processing` parada há mais de 10 min (processo caiu no meio), é retomada; `completed`
 *   nunca. A varredura do worker deixa de pedir a ocorrência com o grupo `completed`.
 * - O texto lê só o que a lista fechada do aviso usa (RF4, emenda de 11/11/2026): número da nota, tipo, data, etapa,
 *   observação, contratante, cliente (razão social do destinatário), endereço de entrega, valor da nota e, no tipo
 *   que pede, a nova data de vencimento. Nunca CPF, CNPJ nem telefone.
 */
import { sql } from 'drizzle-orm'

import type {
  ContractorOccurrenceGroupChannel,
  ContractorOccurrenceGroupPort,
} from '../application/send-automatic-occurrence-mail.use-case.js'
import {
  CONTRACTOR_OCCURRENCE_GROUP_SEND_OPERATION,
  CONTRACTOR_OCCURRENCE_GROUP_TEMPLATE_CHANNEL,
  CONTRACTOR_OCCURRENCE_GROUP_TEMPLATE_KEY,
  NEW_DUE_DATE_NOT_INFORMED,
  contractorOccurrenceMomentLabel,
  summarizeOccurrenceNote,
} from '../domain/contractor-occurrence-group.policy.js'
import {
  formatBrazilianAmount,
  parseAmountToCents,
} from '../../trips/domain/occurrence-amount.policy.js'
import {
  formatIsoDate,
  formatOccurrenceMoment,
} from '../../trips/domain/occurrence-mail-values.policy.js'
import { findTripOccurrenceFeedItem } from '../../trips/infrastructure/trip-occurrence-feed.query.js'
import type { TripQueryable } from '../../trips/infrastructure/trip-queryable.type.js'

const KEY_PREFIX = 'occurrence-auto-mail:'
const TEMPLATE_LOCALE = 'pt-BR'
const STALE_PROCESSING_MINUTES = 10
/** A reserva não tem corpo de pedido para comparar: a impressão é fixa. */
const CLAIM_FINGERPRINT = 'automatic'

type Row = Record<string, unknown>

async function rowsOf(queryable: TripQueryable, query: ReturnType<typeof sql>) {
  return (await queryable.execute(query)) as unknown as readonly Row[]
}

function text(row: Row | undefined, key: string): string {
  const value = row?.[key]
  return typeof value === 'string' ? value : ''
}

/** O canal de grupo da contratante, ou `null` (sem linha, canal `email` ou configuração incompleta). */
export async function findContractorOccurrenceGroupChannel(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly contractorId: string },
): Promise<ContractorOccurrenceGroupChannel | null> {
  const [row] = await rowsOf(
    queryable,
    sql`select group_jid, mention_phone, email_fallback
        from contractor_occurrence_channels
        where company_id = ${params.companyId}::uuid
          and contractor_id = ${params.contractorId}::uuid
          and channel = 'whatsapp_group'
        limit 1`,
  )
  if (row === undefined) return null
  const groupJid = text(row, 'group_jid')
  const mentionPhone = text(row, 'mention_phone')
  if (groupJid === '' || mentionPhone === '') return null
  return { emailFallback: row.email_fallback !== false, groupJid, mentionPhone }
}

/**
 * O modelo do aviso no grupo: a versão WhatsApp da chave do tipo vence o modelo geral; de cada chave, a versão ativa
 * mais alta com corpo. `null` sem nenhum dos dois.
 */
export async function findContractorOccurrenceGroupTemplate(
  queryable: TripQueryable,
  params: { readonly companyId: string; readonly typeKey: null | string },
): Promise<null | string> {
  const typeKey = (params.typeKey ?? '').trim()
  const keys = [...(typeKey === '' ? [] : [typeKey]), CONTRACTOR_OCCURRENCE_GROUP_TEMPLATE_KEY]
  const [template] = await rowsOf(
    queryable,
    sql`select body from notification.templates
        where company_id = ${params.companyId}::uuid
          and key in (${sql.join(
            keys.map((key) => sql`${key}`),
            sql`, `,
          )})
          and channel = ${CONTRACTOR_OCCURRENCE_GROUP_TEMPLATE_CHANNEL}
          and locale = ${TEMPLATE_LOCALE}
          and active
          and btrim(coalesce(body, '')) <> ''
        order by (key = ${CONTRACTOR_OCCURRENCE_GROUP_TEMPLATE_KEY}), version desc
        limit 1`,
  )
  return template === undefined ? null : text(template, 'body')
}

export function createContractorOccurrenceGroupRepository(dependencies: {
  readonly database: TripQueryable
  readonly send: ContractorOccurrenceGroupPort['send']
}): ContractorOccurrenceGroupPort {
  const { database } = dependencies
  return {
    async claim({ companyId, occurrenceId }) {
      const rows = await rowsOf(
        database,
        sql`insert into idempotency_records
              (company_id, operation, idempotency_key, request_fingerprint, status, response)
            values (${companyId}::uuid, ${CONTRACTOR_OCCURRENCE_GROUP_SEND_OPERATION},
                    ${KEY_PREFIX + occurrenceId}, ${CLAIM_FINGERPRINT}, 'processing', '{}'::jsonb)
            on conflict (company_id, operation, idempotency_key) do update
              set status = 'processing', updated_at = now()
              where idempotency_records.status = 'failed'
                 or (idempotency_records.status = 'processing'
                     and idempotency_records.updated_at
                         < now() - make_interval(mins => ${STALE_PROCESSING_MINUTES}))
            returning 1 as claimed`,
      )
      return rows.length > 0
    },

    async readMessage({ companyId, occurrenceId }) {
      const [occurrence] = await rowsOf(
        database,
        sql`select occurrence.note, occurrence.stage, occurrence.created_at,
                   occurrence.requested_due_date::text as requested_due_date,
                   occurrence_type.name as type_name,
                   occurrence_type.asks_new_due_date,
                   occurrence_type.contractor_notification_template_key as type_key,
                   note.number, note.series
            from trip_document_occurrences occurrence
            join company_occurrence_types occurrence_type
              on occurrence_type.company_id = occurrence.company_id
             and occurrence_type.id = occurrence.occurrence_type_id
            join trip_documents document
              on document.company_id = occurrence.company_id
             and document.id = occurrence.trip_document_id
            join nfe_documents note
              on note.company_id = document.company_id and note.id = document.nfe_document_id
            where occurrence.company_id = ${companyId}::uuid
              and occurrence.id = ${occurrenceId}::uuid`,
      )
      if (occurrence === undefined) return null
      const template = await findContractorOccurrenceGroupTemplate(database, {
        companyId,
        typeKey: text(occurrence, 'type_key'),
      })
      if (template === null) return null

      const item = await findTripOccurrenceFeedItem(database, { companyId, occurrenceId })
      const totalValue = item?.document?.totalValue ?? ''
      const requestedDueDate = formatIsoDate(text(occurrence, 'requested_due_date').trim())
      const asksNewDueDate = occurrence.asks_new_due_date === true

      const number = text(occurrence, 'number').trim()
      const series = text(occurrence, 'series').trim()
      const createdAt = occurrence.created_at
      const stage = text(occurrence, 'stage') === 'separation' ? 'separation' : 'delivery'
      return {
        template,
        values: {
          cliente: (item?.document?.recipient?.name ?? '').trim(),
          contratante: (item?.document?.contractor?.name ?? '').trim(),
          data:
            createdAt instanceof Date || typeof createdAt === 'string'
              ? formatOccurrenceMoment(new Date(createdAt))
              : '',
          enderecoEntrega: (item?.document?.destination?.label ?? '').trim(),
          momento: contractorOccurrenceMomentLabel(stage),
          novaData: !asksNewDueDate
            ? ''
            : requestedDueDate === ''
              ? NEW_DUE_DATE_NOT_INFORMED
              : requestedDueDate,
          numeroNota: number === '' ? '' : series === '' ? number : `${number}/${series}`,
          numeroNotaSemSerie: number,
          observacao: summarizeOccurrenceNote(text(occurrence, 'note')),
          tipoOcorrencia: text(occurrence, 'type_name').trim(),
          valorNota: totalValue === '' ? '' : formatBrazilianAmount(parseAmountToCents(totalValue)),
        },
      }
    },

    async record({ attempts, companyId, failure, occurrenceId, status }) {
      await database.execute(
        sql`update idempotency_records
            set status = ${status === 'failed' ? 'failed' : 'completed'},
                response = ${JSON.stringify({ attempts, failure, status })}::jsonb,
                updated_at = now()
            where company_id = ${companyId}::uuid
              and operation = ${CONTRACTOR_OCCURRENCE_GROUP_SEND_OPERATION}
              and idempotency_key = ${KEY_PREFIX + occurrenceId}`,
      )
    },

    send: dependencies.send,
  }
}
