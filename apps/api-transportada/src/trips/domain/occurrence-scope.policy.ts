/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 079: a ocorrência é de **um item** da nota ou **da nota inteira**.
 */

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
