/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079: a ocorrência é de **um item** da nota ou **da nota inteira**. Hoje é de **vários**
 * itens: uma caixa violada costuma levar mais de um, com a mesma foto, a mesma observação e o mesmo
 * tipo — repetir a ocorrência por item multiplicaria o mesmo fato.
 */
import {
  OccurrenceProductDuplicateError,
  OccurrenceProductNotInDocumentError,
  OccurrenceProductSelectionConflictError,
} from './trip.error.js'

export type OccurrenceProduct = {
  readonly code: string
  readonly description: string
}

export type OccurrenceProductScope = {
  readonly productCode: string
  readonly scope: 'document' | 'product'
}

/**
 * ⚠️ **Vazio é a nota inteira, e é o padrão.** Recusa total não tem item a apontar; obrigar a
 * escolher um produto ali faria quem registra escolher qualquer um, e a estatística passaria a
 * dizer que um parafuso específico foi recusado quando a carga toda voltou.
 *
 * ⚠️ **Produto fora da nota é recusado, nunca convertido** em "nota inteira". Apontar para um item
 * que a nota não tem é engano de quem registrou — silenciá-lo gravaria uma ocorrência sobre carga
 * que nunca esteve ali, e ninguém descobriria olhando o registro.
 *
 * O código é comparado sem espaço em volta: a etiqueta é lida com o dedo na tela, e ` ZG-4410` não
 * é outro produto.
 */
export function resolveOccurrenceProductScope(input: {
  readonly productCode: string
  readonly products: readonly OccurrenceProduct[]
}): null | OccurrenceProductScope {
  const code = input.productCode.trim()
  if (code === '') return { productCode: '', scope: 'document' }

  const found = input.products.some((product) => product.code.trim() === code)
  return found ? { productCode: code, scope: 'product' } : null
}

/** A pergunta que a tela faz para decidir se imprime o nome do item ou "a nota toda". */
export function isWholeDocumentOccurrence(input: { readonly productCode: string }): boolean {
  return input.productCode.trim() === ''
}

/** O que a escrita precisa saber: a coluna antiga, a lista nova e se é a nota inteira. */
export type OccurrenceProductSelection = {
  /**
   * Compatibilidade: `trip_document_occurrences.product_code` continua sendo escrita, com o
   * **primeiro** item marcado (vazia na ocorrência da nota inteira). Ocorrência antiga e o fluxo do
   * WhatsApp leem dela, e migrá-la seria reescrever histórico por conveniência de formato.
   */
  readonly productCode: string
  readonly productCodes: readonly string[]
  readonly scope: 'document' | 'product'
}

/**
 * ⚠️ **Lista vazia é a nota inteira, e é o padrão.** Recusa total não tem item a apontar.
 *
 * ⚠️ **Os dois campos juntos são recusados**, nunca reconciliados: `productCode` é o contrato
 * antigo e `productCodes` o novo, e escolher um em silêncio gravaria o item que ninguém marcou.
 *
 * A ordem em que os itens chegam é preservada — é a ordem em que o conferente os marcou, e é a
 * ordem em que o e-mail os cita.
 */
export function resolveOccurrenceProductSelection(input: {
  readonly productCode: string
  readonly productCodes?: readonly string[] | undefined
  readonly products: readonly OccurrenceProduct[]
}): OccurrenceProductSelection {
  const single = input.productCode.trim()
  const many = (input.productCodes ?? []).map((code) => code.trim())

  if (single !== '' && many.length > 0) throw new OccurrenceProductSelectionConflictError()

  const codes = many.length > 0 ? many : single === '' ? [] : [single]
  if (new Set(codes).size !== codes.length) throw new OccurrenceProductDuplicateError()

  const known = new Set(input.products.map((product) => product.code.trim()))
  for (const code of codes) {
    if (!known.has(code)) throw new OccurrenceProductNotInDocumentError()
  }

  return {
    productCode: codes[0] ?? '',
    productCodes: codes,
    scope: codes.length === 0 ? 'document' : 'product',
  }
}

/**
 * A leitura: ocorrência antiga não tem linha em `trip_document_occurrence_products`, e o fluxo do
 * WhatsApp grava só a coluna. Derivar da coluna quando a tabela nova está vazia é o que impede uma
 * ocorrência de um item de aparecer como "a nota inteira" depois desta mudança.
 */
export function resolveOccurrenceProductCodes(input: {
  readonly productCode: string
  readonly productCodes: readonly string[]
}): readonly string[] {
  if (input.productCodes.length > 0) return input.productCodes
  const single = input.productCode.trim()
  return single === '' ? [] : [single]
}
