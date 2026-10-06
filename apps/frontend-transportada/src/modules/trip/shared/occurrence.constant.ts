/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079: o **grupo** do tipo, que é a única parte fixa do produto.
 *
 * ⚠️ Os tipos deixaram de ser cópia por valor em 2026-09-03: eles são cadastro da empresa e vêm do
 * servidor. O que continua fixo é o grupo — `separation` é do galpão e `delivery` é da rua —,
 * porque é ele que decide quem registra, e isso é regra do produto, não escolha de quem cadastra.
 */

/** Os tipos cadastrados: o cadastro, o registro e a recarga depois de um `422` leem a mesma consulta. */
export const OCCURRENCE_TYPES_QUERY_KEY = ['trip', 'occurrence-types'] as const

export const TRIP_OCCURRENCE_STAGE = {
  delivery: 'delivery',
  separation: 'separation',
} as const

export type TripOccurrenceStage = (typeof TRIP_OCCURRENCE_STAGE)[keyof typeof TRIP_OCCURRENCE_STAGE]

/**
 * Spec 164 D1/RF1: `unset` é o padrão e é o que o produto faz hoje — anota e para. A transportadora
 * decide tipo a tipo, quando quiser; ocorrência de tipo `unset` não abre tratativa.
 */
export const OCCURRENCE_REDELIVERY_POLICY = {
  allowed: 'allowed',
  blocked: 'blocked',
  unset: 'unset',
} as const

export type OccurrenceRedeliveryPolicy =
  (typeof OCCURRENCE_REDELIVERY_POLICY)[keyof typeof OCCURRENCE_REDELIVERY_POLICY]

/**
 * Spec 179 RF1: se o tipo exige comprovante (foto) no registro do motorista — o mesmo vocabulário
 * do canhoto (`DELIVERY_PROOF_FIELD_MODES`). Nasce `off`; `required` exige foto e observação.
 */
export const OCCURRENCE_ATTACHMENT_MODE = {
  off: 'off',
  optional: 'optional',
  required: 'required',
} as const

export const OCCURRENCE_ATTACHMENT_MODES = [
  OCCURRENCE_ATTACHMENT_MODE.off,
  OCCURRENCE_ATTACHMENT_MODE.optional,
  OCCURRENCE_ATTACHMENT_MODE.required,
] as const

export type OccurrenceAttachmentMode = (typeof OCCURRENCE_ATTACHMENT_MODES)[number]

/**
 * Spec 241 RF1: se a ocorrência do tipo carrega produtos — o mesmo vocabulário do comprovante
 * (`OCCURRENCE_ATTACHMENT_MODES`). `off` não mostra seletor nem aceita item; `optional` é o
 * comportamento de hoje; `required` (spec 246 RF1b) exige ao menos um produto, ou o mínimo do tipo.
 */
export const OCCURRENCE_ITEMS_MODE = {
  off: 'off',
  optional: 'optional',
  required: 'required',
} as const

export const OCCURRENCE_ITEMS_MODES = [
  OCCURRENCE_ITEMS_MODE.off,
  OCCURRENCE_ITEMS_MODE.optional,
  OCCURRENCE_ITEMS_MODE.required,
] as const

export type OccurrenceItemsMode = (typeof OCCURRENCE_ITEMS_MODES)[number]

export const OCCURRENCE_ITEMS_WRITE_MODES = [
  OCCURRENCE_ITEMS_MODE.off,
  OCCURRENCE_ITEMS_MODE.optional,
  OCCURRENCE_ITEMS_MODE.required,
] as const

export type OccurrenceItemsWriteMode = (typeof OCCURRENCE_ITEMS_WRITE_MODES)[number]

/** Spec 241: API anterior ao campo não diz nada — o tipo carrega itens, como sempre carregou. */
export const DEFAULT_OCCURRENCE_ITEMS_MODE: OccurrenceItemsMode = OCCURRENCE_ITEMS_MODE.optional

/**
 * Spec 218 (D1, RF-B5): qual dos dois caminhos de registro o tipo alimenta — ocorrência **de nota**
 * (`document`, sem fila, abre tratativa) ou ocorrência **de parada** (`stop`, fila offline, nunca
 * abre tratativa). Cópia por valor de `OCCURRENCE_TYPE_FLOWS` (`shared/trip-occurrence.constant.ts`
 * da API) — mudou lá, muda aqui.
 */
export const OCCURRENCE_TYPE_FLOWS = ['document', 'stop'] as const

export type OccurrenceTypeFlow = (typeof OCCURRENCE_TYPE_FLOWS)[number]

/**
 * Spec 246 (RF0): os momentos em que o tipo pode ser registrado. Cópia por valor de
 * `OCCURRENCE_MOMENTS` (`shared/trip-occurrence.constant.ts` da API) — mudou lá, muda aqui. O painel
 * só tolera o campo até a aba Tipos (Fase 5) passar a editá-lo.
 */
export const OCCURRENCE_MOMENTS = ['separation', 'document', 'stop', 'office'] as const

export type OccurrenceMoment = (typeof OCCURRENCE_MOMENTS)[number]

/** Spec 246 RF1/RF3: a API anterior aos campos novos não os manda — o painel lê o valor de hoje. */
export const DEFAULT_OCCURRENCE_NOTE_MODE: OccurrenceAttachmentMode =
  OCCURRENCE_ATTACHMENT_MODE.optional
export const DEFAULT_OCCURRENCE_SIGNATURE_MODE: OccurrenceAttachmentMode =
  OCCURRENCE_ATTACHMENT_MODE.off

/**
 * Spec 246 (RF1c): a faixa da quantidade mínima de fotos. Cópia por valor de
 * `OCCURRENCE_PHOTO_MINIMUM_COUNT` da API — mudou lá, muda aqui. O painel só tolera o campo até a
 * aba Tipos (Fase 5) passar a editá-lo.
 */
export const OCCURRENCE_PHOTO_MINIMUM_COUNT = { max: 5, min: 1 } as const

export type {
  OccurrenceAttachmentContractorOverride,
  OccurrenceAttachmentOverrides,
  OccurrenceAttachmentOverridesByType,
  OccurrenceAttachmentRecipientOverride,
  OccurrenceType,
} from './occurrenceType.types'

/** Revisão do painel M7: o teto do seletor de contratantes da exceção — acima dele a tela avisa que a lista pode estar incompleta. */
export const CONTRACTOR_DIRECTORY_MAX_PAGES = 30
export const CONTRACTOR_DIRECTORY_LIMIT = CONTRACTOR_DIRECTORY_MAX_PAGES * 100

/** Spec 240: o teto do motivo é o do servidor (`OCCURRENCE_CANCELLATION_REASON_TOO_LONG`). */
export const OCCURRENCE_CANCELLATION_REASON_MAX_LENGTH = 500

/** Spec 240: os códigos estáveis que as duas escritas da 167 devolvem (evidence.md, Fase 0). */
export const OCCURRENCE_CORRECTION_ERROR = {
  ALREADY_CANCELLED: 'OCCURRENCE_ALREADY_CANCELLED',
  CANCELLATION_REASON_REQUIRED: 'OCCURRENCE_CANCELLATION_REASON_REQUIRED',
  CANCELLATION_REASON_TOO_LONG: 'OCCURRENCE_CANCELLATION_REASON_TOO_LONG',
  CANCELLED: 'OCCURRENCE_CANCELLED',
  CASE_ALREADY_OPEN: 'OCCURRENCE_CASE_ALREADY_OPEN',
  IDEMPOTENCY_KEY_REUSED: 'TRIP_FIELD_REPORT_KEY_REUSED',
  ITEM_QUANTITY_NOT_POSITIVE: 'OCCURRENCE_ITEM_QUANTITY_NOT_POSITIVE',
  ITEM_QUANTITY_UNIT_PAIRING: 'OCCURRENCE_ITEM_QUANTITY_UNIT_PAIRING',
  OCCURRENCE_NOT_FOUND: 'TRIP_OCCURRENCE_NOT_FOUND',
  PRODUCT_NOT_IN_DOCUMENT: 'OCCURRENCE_PRODUCT_NOT_IN_DOCUMENT',
  TYPE_ITEMS_NOT_ALLOWED: 'OCCURRENCE_TYPE_ITEMS_NOT_ALLOWED',
  TYPE_ITEMS_OFF_REDELIVERY_POLICY: 'OCCURRENCE_TYPE_ITEMS_OFF_REDELIVERY_POLICY',
  TYPE_SINGLE_ITEM: 'OCCURRENCE_TYPE_SINGLE_ITEM',
} as const

export type OccurrenceCorrectionErrorCode =
  (typeof OCCURRENCE_CORRECTION_ERROR)[keyof typeof OCCURRENCE_CORRECTION_ERROR]
