/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverNfeProduct } from './driverTrip.types'
import { resolveOccurrenceAmounts } from './occurrenceAmount.service'
import { readNewDueDate } from './occurrenceNewDueDate.service'
import { isReferenceNumberValid, toReferenceNumber } from './occurrenceDecimalInput.service'
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
import { OCCURRENCE_AMOUNT_SCOPE, OCCURRENCE_FIELD_MODE } from './occurrenceValues.constant'

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
  readonly newDueDate: string | undefined
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
    ...(input.newDueDate === undefined ? {} : { newDueDate: input.newDueDate }),
    ...(input.referenceNumber === undefined ? {} : { referenceNumber: input.referenceNumber }),
  }
}

export function evaluateOccurrenceValues(input: {
  /** O tipo pede o campo opcional "nova data de vencimento"; ausente é não pede. */
  readonly asksNewDueDate?: boolean
  readonly drafts: OccurrenceItemDrafts
  /** Hoje, para recusar data que já passou; ausente é o relógio do aparelho. */
  readonly now?: Date
  readonly products: readonly DriverNfeProduct[]
  readonly requirements: OccurrenceRequirements
  readonly texts: Readonly<{ declaredAmount: string; newDueDate?: string; referenceNumber: string }>
}): OccurrenceValues {
  const { requirements } = input
  const hasItems = requirements.itemsMode !== OCCURRENCE_FIELD_MODE.off
  const isAmountOn = requirements.declaredAmountMode !== OCCURRENCE_FIELD_MODE.off

  /** Primeiro as marcações: o escopo efetivo depende de quantas linhas há (`resolveDeclaredAmountTarget`). */
  const selectedCount = hasItems
    ? input.products.filter((product) => input.drafts[product.code]?.isSelected === true).length
    : 0
  const amountTarget = resolveDeclaredAmountTarget({
    itemsSelectedCount: selectedCount,
    itemsTotalCount: hasItems ? input.products.length : 0,
    requirements,
  })
  const isAmountOnLine = isAmountOn && amountTarget === OCCURRENCE_AMOUNT_SCOPE.item

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
    isAmountOn && amountTarget === OCCURRENCE_AMOUNT_SCOPE.occurrence
      ? readCanonicalAmount(input.texts.declaredAmount)
      : undefined
  const referenceNumber =
    requirements.referenceNumberMode === OCCURRENCE_FIELD_MODE.off
      ? undefined
      : toReferenceNumber(input.texts.referenceNumber)
  const hasInvalidReferenceNumber =
    requirements.referenceNumberMode !== OCCURRENCE_FIELD_MODE.off &&
    !isReferenceNumberValid(input.texts.referenceNumber)
  const newDueDate =
    input.asksNewDueDate === true
      ? readNewDueDate({ now: input.now ?? new Date(), text: input.texts.newDueDate ?? '' })
      : undefined
  const selected = lines.filter((line) => line.isSelected)

  return {
    amountTarget,
    facts: {
      hasDeclaredAmount: declaredAmount !== undefined,
      hasInvalidNewDueDate: newDueDate?.problem !== undefined,
      hasInvalidReferenceNumber,
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
    payload: buildPayload({ declaredAmount, lines, newDueDate: newDueDate?.iso, referenceNumber }),
    totals: buildTotals({ declaredAmount, lines }),
  }
}
