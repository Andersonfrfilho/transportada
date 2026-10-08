/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 246 RF1a: os quatro campos de exigência do tipo, na ordem em que a tela os mostra (a do
 * `preview.html`). Todos usam as mesmas três palavras: Desligado · Opcional · Obrigatório.
 */
export const OCCURRENCE_REQUIREMENT_FIELDS = ['photo', 'note', 'signature', 'items'] as const

export type OccurrenceRequirementField = (typeof OCCURRENCE_REQUIREMENT_FIELDS)[number]

/** O teto do mínimo de produtos: o mesmo da API (`OCCURRENCE_ITEMS_MINIMUM_COUNT_MAX`). */
export const OCCURRENCE_ITEMS_MINIMUM_COUNT_MAX = 999

/**
 * Spec 247 RF3: as duas linhas do registro da devolução com somas — o número do documento do cliente e
 * o valor pago. Usam o mesmo seletor de três estados, mas só valem onde o motorista (ou o escritório)
 * registra sobre uma nota, e a API pode não conhecê-las ainda.
 */
export const OCCURRENCE_RECORD_FIELDS = ['referenceNumber', 'declaredAmount'] as const

export type OccurrenceRecordField = (typeof OCCURRENCE_RECORD_FIELDS)[number]
