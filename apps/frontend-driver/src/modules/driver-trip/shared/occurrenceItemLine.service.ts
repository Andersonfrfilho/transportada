/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverNfeProduct } from './driverTrip.types'
import {
  calculateItemLineAmount,
  formatBrazilianQuantity,
  parseAmountToCents,
  parseScaledDecimal,
} from './occurrenceAmount.service'
import { toCanonicalDecimal } from './occurrenceDecimalInput.service'
import type {
  OccurrenceItemDraft,
  OccurrenceItemLine,
  OccurrenceItemQuantityProblem,
} from './occurrenceDraftValues.types'
import type { OccurrenceRequirements } from './occurrenceRequirements.service'

/** O que `OCCURRENCE_ITEM_QUANTITY_DECIMAL` da API aceita: nove inteiros, três casas. */
const QUANTITY_PATTERN = /^\d{1,9}(\.\d{1,3})?$/u
/** O que `DECLARED_AMOUNT_DECIMAL` da API aceita: sem zero à esquerda, duas casas. */
const DECLARED_AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/u
const NON_ZERO_DIGIT = /[1-9]/u
/** Uma unidade, na escala de 4 casas do `numeric` da nota. */
const ONE_UNIT_SCALED = 10_000n
/** A linha inteira da nota nunca é pedida aqui (a quantidade vem digitada): o `vProd` não entra na conta. */
export const UNUSED_TOTAL_VALUE = '0'

export type ItemLineParams = Readonly<{
  draft: OccurrenceItemDraft
  isAmountOnLine: boolean
  product: DriverNfeProduct
  requirements: OccurrenceRequirements
}>

/** Marcar o produto já sugere devolver uma unidade — ou o que a nota tem, quando é menos de uma. */
export function resolveDefaultQuantityText(product: DriverNfeProduct): string {
  const onNote = tryParseScaled(product.quantity)
  const isLessThanOne = onNote !== undefined && onNote < ONE_UNIT_SCALED
  return isLessThanOne ? formatBrazilianQuantity(product.quantity) : '1'
}

export function readCanonicalAmount(text: string): string | undefined {
  const canonical = toCanonicalDecimal(text)
  return canonical !== undefined && DECLARED_AMOUNT_PATTERN.test(canonical) ? canonical : undefined
}

function tryParseScaled(value: string): bigint | undefined {
  try {
    return parseScaledDecimal(value)
  } catch {
    return undefined
  }
}

function resolveQuantity(input: { readonly product: DriverNfeProduct; readonly text: string }): {
  readonly problem: OccurrenceItemQuantityProblem | undefined
  readonly quantity: string | undefined
} {
  const canonical = toCanonicalDecimal(input.text)
  const isValid =
    canonical !== undefined && QUANTITY_PATTERN.test(canonical) && NON_ZERO_DIGIT.test(canonical)
  if (!isValid) return { problem: 'missing', quantity: undefined }

  const typed = tryParseScaled(canonical)
  const onNote = tryParseScaled(input.product.quantity)
  if (typed !== undefined && onNote !== undefined && typed > onNote) {
    return { problem: 'above-note', quantity: undefined }
  }
  return { problem: undefined, quantity: canonical }
}

function calculateLineCents(input: {
  readonly product: DriverNfeProduct
  readonly quantity: string
}): bigint | undefined {
  if (tryParseScaled(input.product.unitValue) === undefined) return undefined
  return calculateItemLineAmount({
    quantity: input.quantity,
    totalValue: UNUSED_TOTAL_VALUE,
    unitValue: input.product.unitValue,
  })
}

export function buildItemLine(params: ItemLineParams): OccurrenceItemLine {
  const { draft, isAmountOnLine, product, requirements } = params
  const isDeclaredAmountRequired =
    isAmountOnLine &&
    (requirements.declaredAmountMode === 'required' || product.hasVaryingUnitValue)
  const declaredAmount = isAmountOnLine ? readCanonicalAmount(draft.declaredAmountText) : undefined
  const base = {
    declaredAmount,
    draft,
    isDeclaredAmountRequired,
    isSelected: draft.isSelected,
    product,
  }
  if (!draft.isSelected) {
    return {
      ...base,
      itemAmountCents: undefined,
      lineAmountCents: undefined,
      quantity: undefined,
      quantityProblem: undefined,
    }
  }

  const { problem, quantity } = resolveQuantity({ product, text: draft.quantityText })
  const lineAmountCents =
    quantity === undefined ? undefined : calculateLineCents({ product, quantity })
  const itemAmountCents =
    declaredAmount === undefined ? lineAmountCents : parseAmountToCents(declaredAmount)
  return {
    ...base,
    itemAmountCents: lineAmountCents === undefined ? undefined : itemAmountCents,
    lineAmountCents,
    quantity,
    quantityProblem: problem,
  }
}
