/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 237 RF5a item 8: a nota nova do emitente de um contratante com prévia em aberto pede uma
 * reavaliação do vínculo. ⚠️ A importação NUNCA espera nem cai por isso: o pedido corre num
 * `SAVEPOINT` próprio (o molde de `delivery-registry.writer.ts`) e qualquer erro volta só ele.
 * O pedido é coalescido por contratante — com um pendente que ainda tem folga, a nota seguinte não
 * grava outro — e nasce adiado, para o lote inteiro de XMLs virar uma reavaliação só. Sem `unique`, de propósito:
 * esperar a transação de outra importação para decidir o conflito seria atrasar a importação; na
 * corrida rara, duas reavaliações saem, e reavaliar é idempotente.
 */
import { sql } from 'drizzle-orm'

import type { NfeWriteTransaction } from '../../nfe-documents/types/nfe-write-transaction.types.js'
import {
  CARGO_PREVIEW_DECIDED_BY,
  CARGO_PREVIEW_ITEM_STATE,
  CARGO_PREVIEW_OUTBOX_EVENT,
  CARGO_PREVIEW_STATUS,
} from '../../shared/cargo-preview.constant.js'
import type { DeliveryRegistryLogger } from './delivery-registry.writer.js'

/** A janela que junta os XMLs de um lote; a prévia chega horas antes, meio minuto não pesa. */
export const CARGO_PREVIEW_REEVALUATION_DELAY_SECONDS = 30

/**
 * Só coalesce com pedido que ainda tem esta folga antes de sair: o que sai já pode ser lido pela
 * reavaliação antes de esta importação comitar, e a nota dela ficaria sem reavaliação.
 */
export const CARGO_PREVIEW_REEVALUATION_COALESCE_MARGIN_SECONDS = 10

export type RequestCargoPreviewReevaluationParams = {
  readonly companyId: string
  readonly emitterTaxId: string | undefined
  readonly logger?: DeliveryRegistryLogger
  readonly tx: NfeWriteTransaction
}

const OPEN_PREVIEW_STATUSES = [CARGO_PREVIEW_STATUS.queued, CARGO_PREVIEW_STATUS.processing]
const OPEN_ITEM_STATES = [
  CARGO_PREVIEW_ITEM_STATE.awaitingXml,
  CARGO_PREVIEW_ITEM_STATE.suggested,
  CARGO_PREVIEW_ITEM_STATE.ambiguous,
]

function listOf(values: readonly string[]) {
  return sql.join(
    values.map((value) => sql`${value}`),
    sql`, `,
  )
}

/**
 * Só o contratante desse emitente, com perfil e prévia ligados, e com prévia ainda na janela do perfil
 * que pode mudar: na fila de leitura, ou pronta com item em aberto decidido pela máquina. O relógio
 * da folga é `clock_timestamp()`, o do comando, e não o `now()` do começo da importação.
 */
function buildRequestStatement(
  input: RequestCargoPreviewReevaluationParams & { readonly emitterTaxId: string },
) {
  const reevaluate = CARGO_PREVIEW_OUTBOX_EVENT.reevaluate
  return sql`
    insert into cargo_preview_outbox
      (company_id, contractor_id, event_type, correlation_id, payload, next_attempt_at)
    select contractor.company_id, contractor.id, ${reevaluate},
      ${`nfe-import:${crypto.randomUUID()}`}, jsonb_build_object('contractorId', contractor.id),
      now() + make_interval(secs => ${CARGO_PREVIEW_REEVALUATION_DELAY_SECONDS})
    from contractors contractor
    join contractor_receiving_profiles profile
      on profile.company_id = contractor.company_id and profile.contractor_id = contractor.id
      and profile.is_enabled and profile.preview_enabled
    where contractor.company_id = ${input.companyId} and contractor.tax_id = ${input.emitterTaxId}
      and exists (
        select 1 from cargo_previews preview
        where preview.company_id = contractor.company_id and preview.contractor_id = contractor.id
          and preview.received_at >= now() - make_interval(days => profile.match_window_days)
          and (preview.status in (${listOf(OPEN_PREVIEW_STATUSES)})
            or (preview.status = ${CARGO_PREVIEW_STATUS.ready} and exists (
            select 1 from cargo_preview_items item
            where item.company_id = preview.company_id and item.preview_id = preview.id
              and item.match_state in (${listOf(OPEN_ITEM_STATES)})
              and (item.matched_by is null
                or item.matched_by = ${CARGO_PREVIEW_DECIDED_BY.system})))))
      and not exists (
        select 1 from cargo_preview_outbox pending
        where pending.company_id = contractor.company_id and pending.contractor_id = contractor.id
          and pending.event_type = ${reevaluate} and pending.published_at is null
          and pending.next_attempt_at > clock_timestamp()
            + make_interval(secs => ${CARGO_PREVIEW_REEVALUATION_COALESCE_MARGIN_SECONDS}))`
}

export async function requestCargoPreviewReevaluation(
  input: RequestCargoPreviewReevaluationParams,
): Promise<void> {
  const emitterTaxId = input.emitterTaxId
  if (emitterTaxId === undefined || emitterTaxId.length === 0) return
  try {
    await input.tx.transaction(async (savepoint) => {
      await savepoint.execute(buildRequestStatement({ ...input, emitterTaxId }))
    })
  } catch (error) {
    // Nunca o documento nem o CNPJ: a causa e a empresa (`security.md` §1).
    input.logger?.warn('cargo_preview_reevaluation_request_failed', {
      companyId: input.companyId,
      reason: error instanceof Error ? error.name : 'unknown',
    })
  }
}
