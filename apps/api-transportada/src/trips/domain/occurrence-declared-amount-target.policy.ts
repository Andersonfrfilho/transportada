/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (RF1, RF14): onde se digita o valor pago **nesta** ocorrência. O tipo declara o escopo;
 * mas um escopo `item` sem linha nenhuma — a nota inteira, ou Produtos desligado pela exceção — não tem
 * onde digitar, e o valor cai na ocorrência. Só o lugar muda: o **modo** (exigido ou não) é o mesmo.
 */
import {
  OCCURRENCE_DECLARED_AMOUNT_SCOPE,
  OCCURRENCE_ITEMS_MODE,
} from '../../shared/trip-occurrence.constant.js'
import type { OccurrenceDeclaredAmountScope } from '../../shared/trip-occurrence.constant.js'
import type { DeliveryProofFieldMode } from './delivery-proof-settings.policy.js'

export type ResolveDeclaredAmountTargetParams = {
  /** O modo de Produtos **efetivo** (tipo + exceção), nunca o do tipo. */
  readonly itemsMode: DeliveryProofFieldMode
  /** Quantas linhas de item a ocorrência carrega. */
  readonly lineCount: number
  readonly scope: OccurrenceDeclaredAmountScope
}

export function resolveDeclaredAmountTarget(
  params: ResolveDeclaredAmountTargetParams,
): OccurrenceDeclaredAmountScope {
  if (params.scope !== OCCURRENCE_DECLARED_AMOUNT_SCOPE.item) return params.scope
  const hasNoLine = params.lineCount === 0 || params.itemsMode === OCCURRENCE_ITEMS_MODE.off
  return hasNoLine
    ? OCCURRENCE_DECLARED_AMOUNT_SCOPE.occurrence
    : OCCURRENCE_DECLARED_AMOUNT_SCOPE.item
}
