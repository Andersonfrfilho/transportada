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
  /** Spec 237 Fase 3: na doca, antes de existir viagem — a ocorrência pertence à nota da chegada. */
  receiving: 'receiving',
} as const

/** As etapas que a viagem conhece; `receiving` é da chegada (ADR-0094 §9) e nunca entra nelas. */
export const TRIP_BOUND_OCCURRENCE_STAGES = [
  TRIP_OCCURRENCE_STAGE.delivery,
  TRIP_OCCURRENCE_STAGE.separation,
] as const

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
 * Spec 246 (RF0): os momentos em que um tipo pode ser registrado — um conjunto, nunca menos de um,
 * guardado em `company_occurrence_type_moments` (a CHECK é gerada desta lista). `separation` é o
 * galpão, `document` a entrega da nota, `stop` a chegada à parada e `office` o escritório em nome do
 * motorista. A ordem é a do fluxo e é a canônica de toda lista de momentos. Cópia por valor no
 * frontend (`trip/shared/occurrence.constant.ts`).
 */
export const OCCURRENCE_MOMENT = {
  separation: 'separation',
  document: 'document',
  stop: 'stop',
  office: 'office',
} as const

export const OCCURRENCE_MOMENTS = [
  OCCURRENCE_MOMENT.separation,
  OCCURRENCE_MOMENT.document,
  OCCURRENCE_MOMENT.stop,
  OCCURRENCE_MOMENT.office,
] as const

export type OccurrenceMoment = (typeof OCCURRENCE_MOMENTS)[number]

/**
 * Spec 246 (RF0b, T1b.2): a guarda de todo caso de uso que registra ocorrência. O momento é o **do
 * registro**, fixo por caso de uso, e a permissão continua sendo a da rota — é proibido decidir
 * permissão a partir dos momentos do tipo ("o tipo tem algum momento que o papel cobre").
 */
export function acceptsOccurrenceMoment(params: {
  readonly moments: readonly OccurrenceMoment[]
  readonly moment: OccurrenceMoment
}): boolean {
  return params.moments.includes(params.moment)
}

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
 * Spec 241 (RF4): os valores de `items_mode` que o código nomeia — `off` o tipo não carrega itens,
 * `optional` oferece. Spec 246 (RF1b): `required` exige produtos. O vocabulário completo é
 * `DELIVERY_PROOF_FIELD_MODES`.
 */
export const OCCURRENCE_ITEMS_MODE = {
  off: 'off',
  optional: 'optional',
  required: 'required',
} as const

/**
 * Spec 246 (RF1c): a quantidade mínima de fotos do tipo com foto `required`, de 1 a 5 — o molde do
 * `cargoMinimumCount` da entrega. Lida só quando a foto é obrigatória; 1 é o que preserva o
 * comportamento de hoje.
 */
export const OCCURRENCE_PHOTO_MINIMUM_COUNT = {
  default: 1,
  max: 5,
  min: 1,
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

/**
 * Spec 246 (RF1, RF3): o padrão de `note_mode` e `signature_mode` no tipo — a observação hoje é
 * sempre opcional (`off` a esconderia) e a assinatura não existia. Nas exceções as colunas são
 * nulas, sem padrão: nulo herda do tipo (D-a).
 */
export const OCCURRENCE_TYPE_REQUIREMENT_DEFAULTS = {
  noteMode: 'optional',
  signatureMode: 'off',
} as const

/**
 * Spec 246 (RF1c2): o teto da quantidade mínima de produtos no cadastro — a coluna é `smallint`, e
 * nota com mais itens do que isso é caso extremo que o "todos os itens" (nulo) já cobre.
 */
export const OCCURRENCE_ITEMS_MINIMUM_COUNT_MAX = 999

/**
 * Spec 246 (RF1c2): a CHECK `items_minimum_count` só com `required`; o cadastro a traduz em 422
 * quando a corrida a atinge, como a `off ⇒ unset` da 241.
 */
export const OCCURRENCE_TYPE_ITEMS_MINIMUM_SHAPE_CHECK =
  'company_occurrence_types_items_minimum_shape_check'

/** Spec 241 (RF11): a CHECK `off ⇒ unset`; o cadastro a traduz em 422 quando a corrida a atinge. */
export const OCCURRENCE_TYPE_ITEMS_OFF_SHAPE_CHECK =
  'company_occurrence_types_items_off_shape_check'

/**
 * Spec 246 (RF1c2, revisão final M2): a mesma CHECK de forma nas duas tabelas de exceção — nulas, o
 * par é `items_minimum_count` nulo ou `items_mode = 'required'`. A escrita da exceção a traduz em 422
 * quando um mínimo chega sem `required` no estado resultante.
 */
export const OCCURRENCE_OVERRIDE_ITEMS_MINIMUM_SHAPE_CHECKS: readonly string[] = [
  'occurrence_type_contractor_overrides_items_minimum_shape_check',
  'occurrence_type_recipient_overrides_items_minimum_shape_check',
]

/**
 * Spec 247 (RF1): onde o valor pago é digitado — numa linha por item (`item`, exige produtos) ou um
 * só pela ocorrência (`occurrence`). `VARCHAR` com CHECK gerada desta lista, nunca ENUM nativo.
 */
export const OCCURRENCE_DECLARED_AMOUNT_SCOPE = {
  item: 'item',
  occurrence: 'occurrence',
} as const

export const OCCURRENCE_DECLARED_AMOUNT_SCOPES = [
  OCCURRENCE_DECLARED_AMOUNT_SCOPE.item,
  OCCURRENCE_DECLARED_AMOUNT_SCOPE.occurrence,
] as const

export type OccurrenceDeclaredAmountScope = (typeof OCCURRENCE_DECLARED_AMOUNT_SCOPES)[number]

/**
 * Spec 247 (RF1): os padrões das colunas novas do tipo — os dois modos desligados, para nenhum tipo
 * existente mudar de comportamento ao aplicar a migration. Nas exceções as colunas são nulas (herdam).
 */
export const OCCURRENCE_TYPE_DECLARED_AMOUNT_DEFAULTS = {
  declaredAmountLabel: 'Valor pago',
  declaredAmountMode: OCCURRENCE_ITEMS_MODE.off,
  declaredAmountScope: OCCURRENCE_DECLARED_AMOUNT_SCOPE.item,
  referenceNumberLabel: 'Número do documento do cliente',
  referenceNumberMode: OCCURRENCE_ITEMS_MODE.off,
} as const

/**
 * Spec 247 (RF1): o número do documento do cliente (ex.: a NFD) — letras, dígitos, espaço, ponto,
 * barra e hífen, de 1 a 30. Mesma expressão na CHECK (`~`, POSIX) e na validação da API.
 */
export const OCCURRENCE_REFERENCE_NUMBER_PATTERN = '^[A-Za-z0-9 ./-]{1,30}$'

/** Spec 247: o teto dos dois rótulos editáveis do tipo (`varchar(40)`). */
export const OCCURRENCE_REQUIREMENT_LABEL_MAX_LENGTH = 40

/** Spec 079: os tetos do assunto e do corpo do e-mail à contratante (`varchar(200)` e texto). */
export const OCCURRENCE_EMAIL_SUBJECT_MAX_LENGTH = 200
export const OCCURRENCE_EMAIL_BODY_MAX_LENGTH = 4000

/** Spec 247 (RF6): o teto do modelo de cada linha de item do e-mail. */
export const OCCURRENCE_ITEM_LINE_TEMPLATE_MAX_LENGTH = 400

/**
 * Spec 247 (RF1): valor pago digitado por item exige produtos no tipo. O cadastro a traduz em 422
 * quando a corrida a atinge, como a `off ⇒ unset` da 241.
 */
export const OCCURRENCE_TYPE_DECLARED_AMOUNT_ITEMS_CHECK =
  'company_occurrence_types_declared_amount_items_check'

/** O índice único `(company_id, lower(btrim(name)))`, em qualquer etapa — não aparece no schema TS. */
export const OCCURRENCE_TYPE_NAME_UNIQUE = 'company_occurrence_types_company_name_unique'
