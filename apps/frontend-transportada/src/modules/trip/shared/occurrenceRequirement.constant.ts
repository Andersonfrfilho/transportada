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
