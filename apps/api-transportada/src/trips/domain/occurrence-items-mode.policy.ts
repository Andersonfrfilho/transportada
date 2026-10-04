/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 241 (RF6): tipo com Produtos desligado não carrega itens. A pergunta é do **tipo atual**, lido
 * da linha da empresa — nunca do que o cliente diz. Lista vazia vale em qualquer tipo.
 */
import type { DeliveryProofFieldMode } from './delivery-proof-settings.policy.js'
import { OCCURRENCE_ITEMS_MODE } from '../../shared/trip-occurrence.constant.js'
import { OccurrenceTypeItemsNotAllowedError } from './trip.error.js'

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
