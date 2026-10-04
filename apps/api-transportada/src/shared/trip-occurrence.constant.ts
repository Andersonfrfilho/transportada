/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 T020: o que houve com um item da carga.
 *
 * ⚠️ **O grupo não é enfeite — é ele que decide a permissão.** Ocorrência de separação acontece no
 * galpão e é `trip.manage`; a de entrega acontece na rua e é `trip.report`. É a mesma linha que a
 * ADR-0043 já traçou entre trabalho de barracão e trabalho de rua, e repeti-la aqui mantém as duas
 * coerentes em vez de criar um segundo critério ao lado.
 *
 * ⚠️ **Cópia por valor no frontend** (`trip/shared/occurrence.constant.ts`), como `FUEL_TYPES` e
 * `VEHICLE_TYPES` — o bundle não carrega código da API. Mudou tipo ou grupo de um lado? mude do
 * outro; `test/trip-occurrence/catalog.contract.ts` e o gêmeo no frontend guardam a paridade.
 */

export const TRIP_OCCURRENCE_STAGE = {
  /** No caminhão, na rua: quem responde é quem dirige. */
  delivery: 'delivery',
  /** No galpão, antes de a carga sair: quem responde é quem separa. */
  separation: 'separation',
} as const

export type TripOccurrenceStage = (typeof TRIP_OCCURRENCE_STAGE)[keyof typeof TRIP_OCCURRENCE_STAGE]

/**
 * Spec 218 (D1, RF-B5): qual dos dois caminhos de registro o tipo alimenta — a ocorrência **de
 * nota** (`document`, `trip_document_occurrences`, sem fila, abre tratativa) ou a ocorrência **de
 * parada** (`stop`, `trip_stop_occurrences`, fila offline, nunca abre tratativa). Todo tipo
 * cadastrado antes desta spec é `document` por definição — nunca foi usado em `trip_stop_occurrences`.
 * `VARCHAR` com CHECK, nunca ENUM nativo (code-standart §8).
 */
export const OCCURRENCE_TYPE_FLOWS = {
  document: 'document',
  stop: 'stop',
} as const

export type OccurrenceTypeFlow = (typeof OCCURRENCE_TYPE_FLOWS)[keyof typeof OCCURRENCE_TYPE_FLOWS]

/**
 * A ordem é a do fluxo — o que acontece no galpão vem antes do que acontece na rua —, e ela faz
 * parte do contrato: a tela lista nesta ordem, e trocá-la muda o que aparece primeiro para quem
 * está com a caixa na mão.
 */
export const TRIP_OCCURRENCE_TYPES = [
  { stage: TRIP_OCCURRENCE_STAGE.separation, type: 'item_faltante' },
  { stage: TRIP_OCCURRENCE_STAGE.separation, type: 'item_avariado' },
  { stage: TRIP_OCCURRENCE_STAGE.separation, type: 'divergencia_quantidade' },
  { stage: TRIP_OCCURRENCE_STAGE.delivery, type: 'recusa_total' },
  { stage: TRIP_OCCURRENCE_STAGE.delivery, type: 'recusa_parcial' },
  { stage: TRIP_OCCURRENCE_STAGE.delivery, type: 'avaria_transporte' },
  { stage: TRIP_OCCURRENCE_STAGE.delivery, type: 'destinatario_ausente' },
] as const

export type TripOccurrenceType = (typeof TRIP_OCCURRENCE_TYPES)[number]['type']

const STAGE_BY_TYPE = new Map<string, TripOccurrenceStage>(
  TRIP_OCCURRENCE_TYPES.map((entry) => [entry.type, entry.stage]),
)

/** `null` para tipo fora do catálogo: ausência, nunca um palpite de grupo. */
export function resolveOccurrenceStage(type: string): null | TripOccurrenceStage {
  return STAGE_BY_TYPE.get(type) ?? null
}

/**
 * Spec 166 (RF1): o par de fallback — peça ou caixa fechada — para quando o item não trouxe
 * unidade comercial da nota (spec 172 RF3). `VARCHAR` com CHECK, nunca ENUM nativo
 * (code-standart §8). Cópia por valor no frontend, no mesmo molde de `TRIP_OCCURRENCE_STAGE` acima.
 */
export const OCCURRENCE_ITEM_QUANTITY_UNIT = {
  box: 'box',
  unit: 'unit',
} as const

/**
 * Spec 172 (RF1): a unidade real da quantidade é **aberta** — a unidade comercial que o item traz
 * da nota (`KG`, `L`, `CX`...), mais o par de fallback acima. Fechar num union de literais faria
 * toda sigla exótica de XML virar erro de tipo; quem confere o valor é a política de domínio
 * (`occurrence-item-quantity.policy.ts`), não o tipo.
 */
export type OccurrenceItemQuantityUnit = string

/**
 * Spec 241 (RF4): os dois valores de `items_mode` que o código nomeia — `off` o tipo não carrega
 * itens, `optional` oferece. O vocabulário completo é `DELIVERY_PROOF_FIELD_MODES`.
 */
export const OCCURRENCE_ITEMS_MODE = {
  off: 'off',
  optional: 'optional',
} as const

/** Política de reentrega do tipo; `unset` é o que o cadastro grava quando ninguém decidiu. */
export const REDELIVERY_POLICY = {
  allowed: 'allowed',
  blocked: 'blocked',
  unset: 'unset',
} as const

/** Exigência de foto do comprovante; `off` é o padrão do tipo legado sem a coluna preenchida. */
export const OCCURRENCE_ATTACHMENT_MODE = {
  off: 'off',
} as const

/** Spec 241 (RF11): a CHECK `off ⇒ unset`; o cadastro a traduz em 422 quando a corrida a atinge. */
export const OCCURRENCE_TYPE_ITEMS_OFF_SHAPE_CHECK =
  'company_occurrence_types_items_off_shape_check'
