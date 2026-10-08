/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (T7.2b N2): o requisito EFETIVO do tipo para uma ocorrência, como o detalhe o publica — o
 * painel esconde e rotula o número do documento do cliente, o valor pago e Produtos por ele, sem
 * depender da lista de tipos (que exige `settings.manage`). O escopo do valor pago já vem refinado pelo
 * modo de Produtos efetivo e pelas linhas de produto da nota (`resolveDeclaredAmountTarget`), e os
 * rótulos são texto — nenhum dinheiro passa por aqui.
 */
import type { OccurrenceDeclaredAmountScope } from '../../shared/trip-occurrence.constant.js'
import type { DeliveryProofFieldMode } from './delivery-proof-settings.policy.js'
import { resolveDeclaredAmountTarget } from './occurrence-declared-amount-target.policy.js'
import type { OccurrenceRequirements } from './occurrence-requirements.policy.js'

export type TripOccurrenceDetailRequirements = {
  readonly declaredAmountLabel: string
  readonly declaredAmountMode: DeliveryProofFieldMode
  readonly declaredAmountScope: OccurrenceDeclaredAmountScope
  readonly itemsMode: DeliveryProofFieldMode
  readonly referenceNumberLabel: string
  readonly referenceNumberMode: DeliveryProofFieldMode
}

export function buildOccurrenceDetailRequirements(params: {
  /** Quantos produtos distintos a nota tem. */
  readonly productCount: number
  readonly requirements: OccurrenceRequirements
}): TripOccurrenceDetailRequirements {
  const { requirements } = params
  return {
    declaredAmountLabel: requirements.declaredAmountLabel,
    declaredAmountMode: requirements.declaredAmountMode,
    declaredAmountScope: resolveDeclaredAmountTarget({
      itemsMode: requirements.itemsMode,
      lineCount: params.productCount,
      scope: requirements.declaredAmountScope,
    }),
    itemsMode: requirements.itemsMode,
    referenceNumberLabel: requirements.referenceNumberLabel,
    referenceNumberMode: requirements.referenceNumberMode,
  }
}
