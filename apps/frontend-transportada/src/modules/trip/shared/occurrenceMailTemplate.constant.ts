/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (RF5): os marcadores do e-mail à contratante, uma lista fechada por campo. Cópia por valor de
 * `shared/occurrence-template.constant.ts` da API — mudou lá, muda aqui. A ordem é a da tela (a do
 * `preview.html`): primeiro os da ocorrência, depois os de linha.
 */
export const OCCURRENCE_MAIL_CONTEXT = {
  body: 'body',
  itemLine: 'itemLine',
  subject: 'subject',
} as const

export type OccurrenceMailContext =
  (typeof OCCURRENCE_MAIL_CONTEXT)[keyof typeof OCCURRENCE_MAIL_CONTEXT]

/** O marcador que imprime uma linha por item: só no corpo, nunca no assunto nem na linha. */
export const OCCURRENCE_ITEM_LINES_MARKER = 'linhasItens'

/** Valem no assunto, no corpo e na linha de item. */
const OCCURRENCE_LEVEL_MARKERS = [
  'contratante',
  'numeroNotaSemSerie',
  'numeroNota',
  'razaoSocial',
  'valorNota',
  'numeroReferencia',
  'valorDeclarado',
  'somaItens',
  'motorista',
  'parada',
  'data',
  'item',
  'codigoItem',
  'quantidadeItem',
  'observacao',
] as const

const OCCURRENCE_ITEM_ONLY_MARKERS = [
  'unidadeItem',
  'valorUnitarioItem',
  'somaItem',
  'valorItem',
] as const

export const OCCURRENCE_MAIL_MARKERS: Readonly<Record<OccurrenceMailContext, readonly string[]>> = {
  [OCCURRENCE_MAIL_CONTEXT.body]: [...OCCURRENCE_LEVEL_MARKERS, OCCURRENCE_ITEM_LINES_MARKER],
  [OCCURRENCE_MAIL_CONTEXT.itemLine]: [
    ...OCCURRENCE_LEVEL_MARKERS,
    ...OCCURRENCE_ITEM_ONLY_MARKERS,
  ],
  [OCCURRENCE_MAIL_CONTEXT.subject]: OCCURRENCE_LEVEL_MARKERS,
}

/** Os tetos da API: assunto 200, corpo 4000, linha de item 400. */
export const OCCURRENCE_MAIL_MAX_LENGTH: Readonly<Record<OccurrenceMailContext, number>> = {
  [OCCURRENCE_MAIL_CONTEXT.body]: 4000,
  [OCCURRENCE_MAIL_CONTEXT.itemLine]: 400,
  [OCCURRENCE_MAIL_CONTEXT.subject]: 200,
}

/** A pausa na digitação antes de pedir a prévia: sem ela, cada tecla é uma chamada. */
export const OCCURRENCE_MAIL_PREVIEW_DEBOUNCE_MS = 400
