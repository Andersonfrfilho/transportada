/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  OCCURRENCE_ATTACHMENT_MODE,
  OCCURRENCE_ITEMS_MODE,
  type OccurrenceType,
} from './occurrence.constant'
import { CORRECTION_AMOUNT_SCOPE } from './occurrenceCorrectionAmounts.service'

/**
 * Spec 247 T7.2b (N14): o tipo pede o valor pago POR LINHA, exige Produtos e não definiu mínimo — a regra é
 * "todos os itens", e quem configura não percebe que a devolução parcial fica de fora.
 */
export function shouldHintAllItemsRule(
  type: Pick<
    OccurrenceType,
    'declaredAmountMode' | 'declaredAmountScope' | 'itemsMinimumCount' | 'itemsMode'
  >,
): boolean {
  const asksAmount =
    type.declaredAmountMode === OCCURRENCE_ATTACHMENT_MODE.optional ||
    type.declaredAmountMode === OCCURRENCE_ATTACHMENT_MODE.required
  const isByLine = (type.declaredAmountScope ?? CORRECTION_AMOUNT_SCOPE.item) === 'item'
  return (
    asksAmount &&
    isByLine &&
    type.itemsMode === OCCURRENCE_ITEMS_MODE.required &&
    type.itemsMinimumCount === null
  )
}
