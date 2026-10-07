/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079 e spec 247: os marcadores que a empresa pode escrever no modelo de e-mail de cada tipo de
 * ocorrência, em três contextos — assunto, corpo e a linha de cada item.
 *
 * ⚠️ **Lista fechada, e é ela que a tela mostra a quem escreve o texto.** Marcador que o produto não
 * sabe preencher renderiza um buraco no e-mail do cliente — e quem recebe lê isso como defeito do
 * sistema, não como campo vazio.
 */

/** Os marcadores de ocorrência: valem no assunto, no corpo e na linha de item. */
const OCCURRENCE_LEVEL_PLACEHOLDERS = [
  'numeroNota',
  'numeroNotaSemSerie',
  'razaoSocial',
  'valorNota',
  'contratante',
  'motorista',
  'parada',
  'data',
  'item',
  'codigoItem',
  'quantidadeItem',
  'observacao',
  'numeroReferencia',
  'somaItens',
  'valorDeclarado',
] as const

/** O marcador que imprime uma linha por item: só no corpo, nunca no assunto nem na linha. */
export const OCCURRENCE_ITEM_LINES_PLACEHOLDER = 'linhasItens'

/** Os marcadores que só fazem sentido dentro da linha de um item. */
const ITEM_ONLY_PLACEHOLDERS = [
  'unidadeItem',
  'valorUnitarioItem',
  'somaItem',
  'valorItem',
] as const

export const OCCURRENCE_SUBJECT_PLACEHOLDERS = OCCURRENCE_LEVEL_PLACEHOLDERS

export const OCCURRENCE_TEMPLATE_PLACEHOLDERS = [
  ...OCCURRENCE_LEVEL_PLACEHOLDERS,
  OCCURRENCE_ITEM_LINES_PLACEHOLDER,
] as const

export const OCCURRENCE_ITEM_LINE_PLACEHOLDERS = [
  ...OCCURRENCE_LEVEL_PLACEHOLDERS,
  ...ITEM_ONLY_PLACEHOLDERS,
] as const

export const OCCURRENCE_TEMPLATE_CONTEXT = {
  body: 'body',
  itemLine: 'itemLine',
  subject: 'subject',
} as const

export type OccurrenceTemplateContext =
  (typeof OCCURRENCE_TEMPLATE_CONTEXT)[keyof typeof OCCURRENCE_TEMPLATE_CONTEXT]

/** O teto de linhas de item num e-mail; o que passa dele vira "e mais N itens". */
export const OCCURRENCE_ITEM_LINES_LIMIT = 200

/** O formato da linha quando o tipo não escreve o seu. */
export const OCCURRENCE_DEFAULT_ITEM_LINE_TEMPLATE =
  '{{codigoItem}} – {{item}} – {{quantidadeItem}} {{unidadeItem}} – R$ {{valorItem}}'
