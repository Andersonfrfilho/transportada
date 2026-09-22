/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripOccurrence } from './trip.types'

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
