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
 * - Spec 324 (D3): o botão "Avisar a contratante" reserva e grava na mesma operação com a chave dele
 *   (`occurrence-manual-notice:<id>`, via `keyPrefix`), então nunca disputa a reserva do automático nem entra no filtro
 *   da varredura do worker (que lê só `occurrence-auto-mail:`).
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
  formatElapsedWait,
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
 * mais alta com corpo. `null` sem nenhum dos dois. Spec 324 (D10): o botão manual passa `fallbackKey`
 * (`ocorrencia.contratante-aviso-manual`), a última opção da fila; o automático nunca passa.
 */
export async function findContractorOccurrenceGroupTemplate(
  queryable: TripQueryable,
  params: {
    readonly companyId: string
    readonly fallbackKey?: string
    readonly typeKey: null | string
  },
): Promise<null | string> {
  const typeKey = (params.typeKey ?? '').trim()
  const fallbackKey = (params.fallbackKey ?? '').trim()
  const keys = [
    ...(typeKey === '' ? [] : [typeKey]),
    CONTRACTOR_OCCURRENCE_GROUP_TEMPLATE_KEY,
    ...(fallbackKey === '' || fallbackKey === typeKey ? [] : [fallbackKey]),
  ]
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
        order by array_position(array[${sql.join(
          keys.map((key) => sql`${key}`),
          sql`, `,
        )}]::text[], key::text), version desc
        limit 1`,
  )
  return template === undefined ? null : text(template, 'body')
}

/** O valor informado pelo motorista (`numeric` em texto) no formato do e-mail; vazio quando não há valor. */
function formatChargedAmount(stored: string): string {
  const value = stored.trim()
  return value === '' ? '' : formatBrazilianAmount(parseAmountToCents(value))
}

const SAO_PAULO_TIME = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  hourCycle: 'h23',
  minute: '2-digit',
  timeZone: 'America/Sao_Paulo',
})

function asDate(value: unknown): Date | null {
  if (value instanceof Date) return value
  if (typeof value === 'string' && value !== '') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }
  return null
}

/**
 * Os eventos da entrega da parada da nota: quando o motorista saiu para ela (`departed`), quando chegou (`arrived`)
 * e a janela de recebimento do cliente. O momento do evento é o do toque (`occurred_at`, senão `tapped_at`, senão a
 * hora do servidor). Sem o evento, a variável sai vazia e a linha some do texto.
 */
async function readStopEvents(
  database: TripQueryable,
  params: { readonly companyId: string; readonly documentId: string },
): Promise<{
  readonly arrivedAt: Date | null
  readonly departedAt: Date | null
  readonly windowEnd: Date | null
  readonly windowStart: Date | null
}> {
  const [stop] = await rowsOf(
    database,
    sql`select stop.id as stop_id, stop.delivery_window_start, stop.delivery_window_end
        from trip_documents document
        join trip_stops stop
          on stop.company_id = document.company_id and stop.id = document.stop_id
        where document.company_id = ${params.companyId}::uuid
          and document.id = ${params.documentId}::uuid`,
  )
  const stopId = text(stop, 'stop_id')
  if (stopId === '')
    return { arrivedAt: null, departedAt: null, windowEnd: null, windowStart: null }
  const events = await rowsOf(
    database,
    sql`select kind, coalesce(occurred_at, tapped_at, recorded_at) as moment
        from trip_stop_events
        where company_id = ${params.companyId}::uuid
          and stop_id = ${stopId}::uuid
          and kind in ('departed', 'arrived')
        order by recorded_at desc`,
  )
  const latest = (kind: string): Date | null => {
    const found = events.find((event) => text(event, 'kind') === kind)
    return found === undefined ? null : asDate(found.moment)
  }
  return {
    arrivedAt: latest('arrived'),
    departedAt: latest('departed'),
    windowEnd: asDate(stop?.delivery_window_end),
    windowStart: asDate(stop?.delivery_window_start),
  }
}

export function createContractorOccurrenceGroupRepository(dependencies: {
  readonly database: TripQueryable
  readonly now?: () => Date
  readonly send: ContractorOccurrenceGroupPort['send']
}): ContractorOccurrenceGroupPort {
  const { database } = dependencies
  return {
    async claim({ companyId, keyPrefix, occurrenceId }) {
      const rows = await rowsOf(
        database,
        sql`insert into idempotency_records
              (company_id, operation, idempotency_key, request_fingerprint, status, response)
            values (${companyId}::uuid, ${CONTRACTOR_OCCURRENCE_GROUP_SEND_OPERATION},
                    ${(keyPrefix ?? KEY_PREFIX) + occurrenceId}, ${CLAIM_FINGERPRINT}, 'processing', '{}'::jsonb)
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

    async readMessage({ companyId, fallbackTemplateKey, occurrenceId }) {
      const [occurrence] = await rowsOf(
        database,
        sql`select occurrence.note, occurrence.stage, occurrence.created_at, occurrence.trip_document_id,
                   occurrence.requested_due_date::text as requested_due_date,
                   occurrence.declared_amount::text as declared_amount,
                   occurrence_type.name as type_name,
                   occurrence_type.asks_new_due_date,
                   occurrence_type.contractor_notification_template_key as type_key,
                   note.number, note.series
            from (
              select company_id, id, trip_document_id, note, stage, created_at, requested_due_date,
                     occurrence_type_id, declared_amount
              from trip_document_occurrences
              union all
              /** Spec 343 (RF1): a ocorrência de parada com nota também avisa, só pelo botão. */
              select company_id, id, trip_document_id, description as note, 'delivery' as stage,
                     created_at, null::date as requested_due_date, occurrence_type_id, declared_amount
              from trip_stop_occurrences
              where trip_document_id is not null
            ) occurrence
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
        ...(fallbackTemplateKey === undefined ? {} : { fallbackKey: fallbackTemplateKey }),
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
      const events = await readStopEvents(database, {
        companyId,
        documentId: text(occurrence, 'trip_document_id'),
      })
      const formatMoment = (value: Date | null): string =>
        value === null ? '' : formatOccurrenceMoment(value)
      const window =
        events.windowStart !== null && events.windowEnd !== null
          ? `${SAO_PAULO_TIME.format(events.windowStart)} às ${SAO_PAULO_TIME.format(events.windowEnd)}`
          : ''
      const stage = text(occurrence, 'stage') === 'separation' ? 'separation' : 'delivery'
      return {
        template,
        values: {
          chegada: formatMoment(events.arrivedAt),
          cliente: (item?.document?.recipient?.name ?? '').trim(),
          contratante: (item?.document?.contractor?.name ?? '').trim(),
          data:
            createdAt instanceof Date || typeof createdAt === 'string'
              ? formatOccurrenceMoment(new Date(createdAt))
              : '',
          enderecoEntrega: (item?.document?.destination?.label ?? '').trim(),
          inicioRota: formatMoment(events.departedAt),
          janelaRecebimento: window,
          momento: contractorOccurrenceMomentLabel(stage),
          novaData: !asksNewDueDate
            ? ''
            : requestedDueDate === ''
              ? NEW_DUE_DATE_NOT_INFORMED
              : requestedDueDate,
          numeroNota: number === '' ? '' : series === '' ? number : `${number}/${series}`,
          numeroNotaSemSerie: number,
          observacao: summarizeOccurrenceNote(text(occurrence, 'note')),
          tempoEspera: formatElapsedWait(
            events.arrivedAt,
            (dependencies.now ?? (() => new Date()))(),
          ),
          tipoOcorrencia: text(occurrence, 'type_name').trim(),
          /** Spec 343: o valor que o motorista informou no app (cobrança no recebimento, valor pago); vazio sem valor. */
          valorCobrado: formatChargedAmount(text(occurrence, 'declared_amount')),
          valorNota: totalValue === '' ? '' : formatBrazilianAmount(parseAmountToCents(totalValue)),
        },
      }
    },

    async record({ attempts, companyId, failure, keyPrefix, occurrenceId, status }) {
      await database.execute(
        sql`update idempotency_records
            set status = ${status === 'failed' ? 'failed' : 'completed'},
                response = ${JSON.stringify({ attempts, failure, status })}::jsonb,
                updated_at = now()
            where company_id = ${companyId}::uuid
              and operation = ${CONTRACTOR_OCCURRENCE_GROUP_SEND_OPERATION}
              and idempotency_key = ${(keyPrefix ?? KEY_PREFIX) + occurrenceId}`,
      )
    },

    send: dependencies.send,
  }
}
