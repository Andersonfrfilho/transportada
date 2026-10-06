/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A forma do cadastro de Produtos do tipo, validada sobre o estado RESULTANTE do `PUT` — campo
 * ausente lê o valor gravado. A CHECK do banco é só a rede.
 */
import { OCCURRENCE_ITEMS_MODE, REDELIVERY_POLICY } from '../../shared/trip-occurrence.constant.js'
import type { RedeliveryPolicy } from '../../database/trip.schema.js'
import type { DeliveryProofFieldMode } from './delivery-proof-settings.policy.js'
import {
  OccurrenceTypeItemsMinimumRequiresRequiredError,
  OccurrenceTypeItemsOffRedeliveryPolicyError,
} from './trip.error.js'

type ItemsMinimumShape = {
  readonly itemsMinimumCount?: null | number | undefined
  readonly itemsMode?: DeliveryProofFieldMode | undefined
}

export type AssertItemsMinimumMatchesModeParams = {
  readonly stored: ItemsMinimumShape | null
  readonly values: ItemsMinimumShape
}

/**
 * Spec 246 (RF1c2): a quantidade mínima de produtos só existe com Produtos obrigatório — `optional`
 * + mínimo é dado morto que um `PUT` futuro religaria sem ninguém ver.
 */
export function assertItemsMinimumMatchesMode(params: AssertItemsMinimumMatchesModeParams): void {
  const { stored, values } = params
  const resultingMode = values.itemsMode ?? stored?.itemsMode ?? OCCURRENCE_ITEMS_MODE.optional
  const resultingMinimum =
    values.itemsMinimumCount === undefined
      ? (stored?.itemsMinimumCount ?? null)
      : values.itemsMinimumCount
  if (resultingMinimum !== null && resultingMode !== OCCURRENCE_ITEMS_MODE.required) {
    throw new OccurrenceTypeItemsMinimumRequiresRequiredError()
  }
}

export type ItemsOffShapeParams = {
  readonly stored: {
    readonly itemsMode?: DeliveryProofFieldMode | undefined
    readonly redeliveryPolicy?: RedeliveryPolicy | undefined
  } | null
  readonly values: {
    readonly itemsMode?: DeliveryProofFieldMode | undefined
    readonly redeliveryPolicy?: RedeliveryPolicy | undefined
  }
}

/**
 * Spec 241 (RF11, D1): valida o estado **resultante** — campo ausente lê o valor gravado, porque
 * `off` + política diferente de `unset` é tratativa que não fecha. A CHECK do banco é só a rede.
 */
export function assertItemsOffHasNoRedeliveryPolicy(params: ItemsOffShapeParams): void {
  const { stored } = params
  const { itemsMode, redeliveryPolicy } = params.values

  const resultingItemsMode = itemsMode ?? stored?.itemsMode ?? OCCURRENCE_ITEMS_MODE.optional
  const resultingPolicy = redeliveryPolicy ?? stored?.redeliveryPolicy ?? REDELIVERY_POLICY.unset
  if (
    resultingItemsMode === OCCURRENCE_ITEMS_MODE.off &&
    resultingPolicy !== REDELIVERY_POLICY.unset
  ) {
    throw new OccurrenceTypeItemsOffRedeliveryPolicyError()
  }
}
