/* Copyright (c) 2026 Ada Technology. MIT License. */
import { OCCURRENCE_QUANTITY_UNITS, type OccurrenceQuantityUnit } from './trip.constant'
import type { TripDocumentProduct, TripOccurrence } from './trip.types'

/** A unidade padrão quando a quantidade foi digitada e a unidade ainda não foi escolhida. */
export const OCCURRENCE_DEFAULT_QUANTITY_UNIT: OccurrenceQuantityUnit = OCCURRENCE_QUANTITY_UNITS[1]

/**
 * Uma ocorrência pode apontar **vários** itens da nota. A lista vazia é "a nota inteira" — não há
 * um código sentinela para ela, e por isso a opção da nota inteira é exclusiva: marcá-la limpa os
 * itens, e marcar um item a desmarca.
 */

/** O valor da opção "a nota inteira" no `MultiSelect` — nunca um código de produto real. */
export const OCCURRENCE_WHOLE_DOCUMENT_VALUE = ''

/**
 * O `MultiSelect` devolve a lista inteira depois do clique, não o item clicado: a exclusividade
 * sai da diferença entre antes e depois. Marcar a nota inteira agora vence os itens; qualquer
 * outra mudança apaga a nota inteira da lista.
 */
export function resolveOccurrenceProductSelection(
  input: Readonly<{ next: readonly string[]; previous: readonly string[] }>,
): readonly string[] {
  const hasWholeDocument = input.next.includes(OCCURRENCE_WHOLE_DOCUMENT_VALUE)
  const hadWholeDocument = input.previous.includes(OCCURRENCE_WHOLE_DOCUMENT_VALUE)
  if (hasWholeDocument && !hadWholeDocument) return []
  return input.next.filter((value) => value !== OCCURRENCE_WHOLE_DOCUMENT_VALUE)
}

/**
 * O que o `MultiSelect` mostra marcado: sem item escolhido, a pílula é "a nota inteira" — um campo
 * vazio não diria que o padrão já está valendo.
 */
export function resolveOccurrenceProductSelectionValues(
  selected: readonly string[],
): readonly string[] {
  return selected.length === 0 ? [OCCURRENCE_WHOLE_DOCUMENT_VALUE] : selected
}

/**
 * Os itens de uma ocorrência já gravada. `productCodes` é o contrato novo; `productCode` continua
 * sendo lido para a resposta que vier de uma API ainda sem o campo — e o vazio dele sempre
 * significou a nota inteira.
 */
export function resolveOccurrenceProductCodes(
  occurrence: Pick<TripOccurrence, 'productCode' | 'productCodes'>,
): readonly string[] {
  if (occurrence.productCodes !== undefined) return occurrence.productCodes
  return occurrence.productCode === '' ? [] : [occurrence.productCode]
}

/** A listagem imprime **todos** os itens marcados, não só o primeiro. */
export function formatOccurrenceProductLabel(
  input: Readonly<{ codes: readonly string[]; wholeDocumentLabel: string }>,
): string {
  return input.codes.length === 0 ? input.wholeDocumentLabel : input.codes.join(', ')
}

/**
 * Spec 166 RF4/RF7: monta as duas listas que o registro manda ao servidor, alinhadas por índice a
 * `codes` — é o formato que `productQuantities`/`productQuantityUnits` exigem (RF4, CA05). Item
 * sem quantidade digitada viaja em branco (`null`): a contagem nunca é obrigatória.
 */
export function resolveOccurrenceItemQuantityFields(
  input: Readonly<{
    codes: readonly string[]
    quantitiesByCode: ReadonlyMap<
      string,
      Readonly<{ quantity: string; unit: OccurrenceQuantityUnit }>
    >
  }>,
): Readonly<{
  productQuantities: readonly (null | string)[]
  productQuantityUnits: readonly (null | OccurrenceQuantityUnit)[]
}> {
  const productQuantities: (null | string)[] = []
  const productQuantityUnits: (null | OccurrenceQuantityUnit)[] = []
  for (const code of input.codes) {
    const entry = input.quantitiesByCode.get(code)
    const quantity = entry?.quantity.trim() ?? ''
    productQuantities.push(quantity === '' ? null : quantity)
    productQuantityUnits.push(
      quantity === '' ? null : (entry?.unit ?? OCCURRENCE_DEFAULT_QUANTITY_UNIT),
    )
  }
  return { productQuantities, productQuantityUnits }
}

/** Um item da ocorrência já gravada, com a contagem — ou sem ela (P3). */
export type OccurrenceProductEntry = Readonly<{
  code: string
  quantity: null | string
  unit: null | OccurrenceQuantityUnit
}>

/**
 * Spec 166 P3: os itens da ocorrência já gravada, casados com a contagem que `products` trouxe.
 * Item sem linha em `products` (ocorrência antiga, ou item sem contagem) sai com `quantity`/`unit`
 * nulos — a leitura nunca inventa um zero.
 */
export function resolveOccurrenceProductEntries(
  occurrence: Pick<TripOccurrence, 'productCode' | 'productCodes' | 'products'>,
): readonly OccurrenceProductEntry[] {
  return resolveOccurrenceProductCodes(occurrence).map((code) => {
    const product = occurrence.products?.find((candidate) => candidate.code === code)
    return { code, quantity: product?.quantity ?? null, unit: product?.unit ?? null }
  })
}

/** Item sem contagem aparece sem número — nunca com zero (P3). */
export function formatOccurrenceProductEntryLabel(
  input: Readonly<{
    entry: OccurrenceProductEntry
    unitLabels: Readonly<Record<OccurrenceQuantityUnit, string>>
  }>,
): string {
  const { entry, unitLabels } = input
  if (entry.quantity === null || entry.unit === null) return entry.code
  return `${entry.code} (${entry.quantity} ${unitLabels[entry.unit]})`
}

/** A linha inteira da leitura: todos os itens, cada um com a contagem que tiver, ou "a nota inteira". */
export function formatOccurrenceProductsLine(
  input: Readonly<{
    occurrence: Pick<TripOccurrence, 'productCode' | 'productCodes' | 'products'>
    unitLabels: Readonly<Record<OccurrenceQuantityUnit, string>>
    wholeDocumentLabel: string
  }>,
): string {
  const entries = resolveOccurrenceProductEntries(input.occurrence)
  if (entries.length === 0) return input.wholeDocumentLabel
  return entries
    .map((entry) => formatOccurrenceProductEntryLabel({ entry, unitLabels: input.unitLabels }))
    .join(', ')
}

/** Um item da ocorrência pronto para a leitura: o código, o que ele é, e quanto foi. */
export type OccurrenceItemDescription = Readonly<{
  code: string
  /** `null` quando a nota carregada não tem esse código — o código é verdade, a descrição não. */
  description: null | string
  /** `null` é item sem contagem. Nunca zero (spec 166 P3). */
  quantity: null | string
}>

/**
 * Revisão de leitura (22/09): a lista de ocorrências dizia só o código do item, e código não é
 * item — quem lê não sabe o que foi avariado sem abrir a nota. A descrição já está na tela, no
 * mesmo `products` que o formulário usa para marcar; aqui ela chega à leitura.
 *
 * Lista vazia é a nota inteira, e **quem decide como dizer isso é a tela** — devolver aqui um rótulo
 * pronto misturaria texto de interface com regra, e o texto tem de vir do dicionário.
 */
export function describeOccurrenceItems(
  input: Readonly<{
    occurrence: Pick<TripOccurrence, 'productCode' | 'productCodes' | 'products'>
    products: readonly TripDocumentProduct[]
    unitLabels: Readonly<Record<OccurrenceQuantityUnit, string>>
  }>,
): readonly OccurrenceItemDescription[] {
  const descriptionByCode = new Map(
    input.products.map((product) => [product.code, product.description] as const),
  )
  return resolveOccurrenceProductEntries(input.occurrence).map((entry) => ({
    code: entry.code,
    description: descriptionByCode.get(entry.code) ?? null,
    quantity:
      entry.quantity === null || entry.unit === null
        ? null
        : `${entry.quantity} ${input.unitLabels[entry.unit]}`,
  }))
}
