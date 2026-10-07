/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverNfeProduct } from './driverTrip.types'
import { resolveOccurrenceAmounts } from './occurrenceAmount.service'
import { toReferenceNumber } from './occurrenceDecimalInput.service'
import {
  EMPTY_OCCURRENCE_ITEM_DRAFT,
  type OccurrenceItemDrafts,
  type OccurrenceItemLine,
  type OccurrenceTotals,
  type OccurrenceValues,
  type OccurrenceValuesPayload,
} from './occurrenceDraftValues.types'
import {
  buildItemLine,
  readCanonicalAmount,
  UNUSED_TOTAL_VALUE,
} from './occurrenceItemLine.service'
import {
  resolveDeclaredAmountTarget,
  type OccurrenceRequirements,
} from './occurrenceRequirements.service'

export { resolveDefaultQuantityText } from './occurrenceItemLine.service'
export {
  EMPTY_OCCURRENCE_ITEM_DRAFT,
  type OccurrenceItemDraft,
  type OccurrenceItemDrafts,
  type OccurrenceItemLine,
  type OccurrenceItemQuantityProblem,
  type OccurrenceTotals,
  type OccurrenceValues,
  type OccurrenceValuesPayload,
} from './occurrenceDraftValues.types'

/**
 * Spec 247 (T5.3, RF11): o que o motorista marcou e digitou — produtos, quantidades, valor pago e
 * número do documento — avaliado no aparelho, **sem rede**, pelos modos efetivos do snapshot. Aqui nasce
 * o que a tela mostra (soma da linha, soma geral), o que segura o botão e o corpo que sai pela fila.
 * A conta é a do servidor (`occurrenceAmount.service.ts`, espelho com contrato); o servidor recalcula.
 */

function buildTotals(input: {
  readonly declaredAmount: string | undefined
  readonly lines: readonly OccurrenceItemLine[]
}): OccurrenceTotals | undefined {
  const summable = input.lines.flatMap((line) =>
    line.isSelected && line.quantity !== undefined
      ? [
          {
            declaredAmount: line.declaredAmount ?? null,
            quantity: line.quantity,
            totalValue: UNUSED_TOTAL_VALUE,
            unitValue: line.product.unitValue,
          },
        ]
      : [],
  )
  if (summable.length === 0 && input.declaredAmount === undefined) return undefined

  const summary = resolveOccurrenceAmounts({
    declaredAmount: input.declaredAmount ?? null,
    lines: summable,
  })
  return {
    declaredAmountCents: summary.declaredAmountCents,
    itemsSumCents: summary.itemsSumCents,
  }
}

function buildPayload(input: {
  readonly declaredAmount: string | undefined
  readonly lines: readonly OccurrenceItemLine[]
  readonly referenceNumber: string | undefined
}): OccurrenceValuesPayload {
  const items = input.lines.flatMap((line) =>
    line.isSelected && line.quantity !== undefined
      ? [
          {
            ...(line.declaredAmount === undefined ? {} : { declaredAmount: line.declaredAmount }),
            productCode: line.product.code,
            quantity: line.quantity,
          },
        ]
      : [],
  )
  return {
    ...(input.declaredAmount === undefined ? {} : { declaredAmount: input.declaredAmount }),
    ...(items.length === 0 ? {} : { items }),
    ...(input.referenceNumber === undefined ? {} : { referenceNumber: input.referenceNumber }),
  }
}

export function evaluateOccurrenceValues(input: {
  readonly drafts: OccurrenceItemDrafts
  readonly products: readonly DriverNfeProduct[]
  readonly requirements: OccurrenceRequirements
  readonly texts: Readonly<{ declaredAmount: string; referenceNumber: string }>
}): OccurrenceValues {
  const { requirements } = input
  const hasItems = requirements.itemsMode !== 'off'
  const isAmountOn = requirements.declaredAmountMode !== 'off'

  /** Primeiro as marcações: o escopo efetivo depende de quantas linhas há (`resolveDeclaredAmountTarget`). */
  const selectedCount = hasItems
    ? input.products.filter((product) => input.drafts[product.code]?.isSelected === true).length
    : 0
  const amountTarget = resolveDeclaredAmountTarget({
    itemsSelectedCount: selectedCount,
    itemsTotalCount: hasItems ? input.products.length : 0,
    requirements,
  })
  const isAmountOnLine = isAmountOn && amountTarget === 'item'

  const lines = input.products.map((product) =>
    buildItemLine({
      draft: hasItems
        ? (input.drafts[product.code] ?? EMPTY_OCCURRENCE_ITEM_DRAFT)
        : EMPTY_OCCURRENCE_ITEM_DRAFT,
      isAmountOnLine,
      product,
      requirements,
    }),
  )
  const declaredAmount =
    isAmountOn && amountTarget === 'occurrence'
      ? readCanonicalAmount(input.texts.declaredAmount)
      : undefined
  const referenceNumber =
    requirements.referenceNumberMode === 'off'
      ? undefined
      : toReferenceNumber(input.texts.referenceNumber)
  const selected = lines.filter((line) => line.isSelected)

  return {
    amountTarget,
    facts: {
      hasDeclaredAmount: declaredAmount !== undefined,
      hasInvalidItemQuantity: selected.some((line) => line.quantityProblem !== undefined),
      hasReferenceNumber: referenceNumber !== undefined,
      itemsSelectedCount: selected.length,
      itemsTotalCount: hasItems ? input.products.length : 0,
      lineAmountMissingCount: isAmountOnLine
        ? selected.filter(
            (line) => line.isDeclaredAmountRequired && line.declaredAmount === undefined,
          ).length
        : 0,
    },
    lines,
    payload: buildPayload({ declaredAmount, lines, referenceNumber }),
    totals: buildTotals({ declaredAmount, lines }),
  }
}
