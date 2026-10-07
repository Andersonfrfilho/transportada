/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 (RF6): tipo com Produtos desligado não carrega itens. A pergunta é do **tipo atual**, lido
 * da linha da empresa — nunca do que o cliente diz. Lista vazia vale em qualquer tipo.
 */
import type { DeliveryProofFieldMode } from './delivery-proof-settings.policy.js'
import { OCCURRENCE_ITEMS_MODE } from '../../shared/trip-occurrence.constant.js'
import {
  OccurrenceTypeItemsNotAllowedError,
  TripOccurrenceItemsMinimumNotMetError,
  TripOccurrenceItemsRequiredError,
} from './trip.error.js'

export type AssertOccurrenceTypeAcceptsProductsParams = {
  /** Ausente é `optional`: dublê de teste e leitura anterior à coluna. */
  readonly itemsMode: DeliveryProofFieldMode | undefined
  readonly productCode: string
  readonly productCodes?: readonly string[] | undefined
}

export function assertOccurrenceTypeAcceptsProducts(
  params: AssertOccurrenceTypeAcceptsProductsParams,
): void {
  if (params.itemsMode !== OCCURRENCE_ITEMS_MODE.off) return

  const hasProduct = params.productCode.trim() !== '' || (params.productCodes ?? []).length > 0
  if (hasProduct) throw new OccurrenceTypeItemsNotAllowedError()
}

export type AssertOccurrenceItemsRequirementParams = {
  /** Nulo é "todos os itens da nota". */
  readonly itemsMinimumCount: null | number
  readonly itemsMode: DeliveryProofFieldMode
  /** Quantos itens a ocorrência aponta; a nota inteira aponta todos. */
  readonly selectedCount: number
  /** Quantos itens a nota tem. */
  readonly totalCount: number
}

/**
 * Spec 246 (RF1b, RF1c2, RF8): com Produtos obrigatório, a ocorrência aponta ao menos um item, e ao menos
 * o mínimo — ou todos, quando o mínimo é nulo. ⚠️ O mínimo nunca passa do total da nota: exigir dois
 * itens de uma nota de um item tornaria a ocorrência impossível de registrar. `off` e `optional` nunca
 * recusam por contagem.
 */
export function assertOccurrenceItemsRequirement(
  params: AssertOccurrenceItemsRequirementParams,
): void {
  if (params.itemsMode !== OCCURRENCE_ITEMS_MODE.required) return
  if (params.selectedCount === 0) throw new TripOccurrenceItemsRequiredError()

  const minimum = Math.min(params.itemsMinimumCount ?? params.totalCount, params.totalCount)
  if (params.selectedCount < minimum) throw new TripOccurrenceItemsMinimumNotMetError()
}
