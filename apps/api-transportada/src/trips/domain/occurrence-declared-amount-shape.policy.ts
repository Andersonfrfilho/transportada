/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (RF1): valor pago digitado por item exige produtos no tipo — sem linha não há onde digitar.
 * Validado sobre o estado RESULTANTE do `PUT` (campo ausente lê o gravado); a CHECK do banco é só a rede.
 */
import {
  OCCURRENCE_DECLARED_AMOUNT_SCOPE,
  OCCURRENCE_ITEMS_MODE,
  OCCURRENCE_TYPE_DECLARED_AMOUNT_DEFAULTS,
} from '../../shared/trip-occurrence.constant.js'
import type { OccurrenceDeclaredAmountScope } from '../../shared/trip-occurrence.constant.js'
import type { DeliveryProofFieldMode } from './delivery-proof-settings.policy.js'
import { OccurrenceTypeDeclaredAmountNeedsItemsError } from './trip.error.js'

type DeclaredAmountShape = {
  readonly declaredAmountMode?: DeliveryProofFieldMode | undefined
  readonly declaredAmountScope?: OccurrenceDeclaredAmountScope | undefined
  readonly itemsMode?: DeliveryProofFieldMode | undefined
}

export type AssertDeclaredAmountHasItemsParams = {
  readonly stored: DeclaredAmountShape | null
  readonly values: DeclaredAmountShape
}

/** Inválido: modo ≠ off **e** escopo `item` **e** produtos `off` — os três termos juntos. */
export function assertDeclaredAmountHasItems(params: AssertDeclaredAmountHasItemsParams): void {
  const { stored, values } = params
  const mode =
    values.declaredAmountMode ??
    stored?.declaredAmountMode ??
    OCCURRENCE_TYPE_DECLARED_AMOUNT_DEFAULTS.declaredAmountMode
  const scope =
    values.declaredAmountScope ??
    stored?.declaredAmountScope ??
    OCCURRENCE_TYPE_DECLARED_AMOUNT_DEFAULTS.declaredAmountScope
  const itemsMode = values.itemsMode ?? stored?.itemsMode ?? OCCURRENCE_ITEMS_MODE.optional

  const isInvalid =
    mode !== OCCURRENCE_ITEMS_MODE.off &&
    scope === OCCURRENCE_DECLARED_AMOUNT_SCOPE.item &&
    itemsMode === OCCURRENCE_ITEMS_MODE.off
  if (isInvalid) throw new OccurrenceTypeDeclaredAmountNeedsItemsError()
}
