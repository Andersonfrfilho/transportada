/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverNfeProduct } from './driverTrip.types'
import {
  calculateItemLineAmount,
  parseAmountToCents,
  parseScaledDecimal,
  resolveOccurrenceAmounts,
} from './occurrenceAmount.service'
import { toCanonicalDecimal, toReferenceNumber } from './occurrenceDecimalInput.service'
import {
  resolveDeclaredAmountTarget,
  type DeclaredAmountScope,
  type OccurrenceRequirements,
  type OccurrenceValuesFacts,
} from './occurrenceRequirements.service'

/**
 * Spec 247 (T5.3, RF11): o que o motorista marcou e digitou — produtos, quantidades, valor pago e
 * número do documento — avaliado no aparelho, **sem rede**, pelos modos efetivos do snapshot. Aqui nasce
 * o que a tela mostra (soma da linha, soma geral), o que segura o botão e o corpo que sai pela fila.
 * A conta é a do servidor (`occurrenceAmount.service.ts`, espelho com contrato); o servidor recalcula.
 */

/** O que `OCCURRENCE_ITEM_QUANTITY_DECIMAL` da API aceita: nove inteiros, três casas. */
const QUANTITY_PATTERN = /^\d{1,9}(\.\d{1,3})?$/u
/** O que `DECLARED_AMOUNT_DECIMAL` da API aceita: sem zero à esquerda, duas casas. */
const DECLARED_AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/u
const NON_ZERO_DIGIT = /[1-9]/u
/** A linha inteira da nota nunca é pedida aqui (a quantidade vem digitada): o `vProd` não entra na conta. */
const UNUSED_TOTAL_VALUE = '0'

export type OccurrenceItemDraft = Readonly<{
  declaredAmountText: string
  isSelected: boolean
  quantityText: string
}>

/** Por código do produto: a ocorrência aponta produto por código (spec 166). */
export type OccurrenceItemDrafts = Readonly<Record<string, OccurrenceItemDraft>>

export const EMPTY_OCCURRENCE_ITEM_DRAFT: OccurrenceItemDraft = {
  declaredAmountText: '',
  isSelected: false,
  quantityText: '',
}

export type OccurrenceItemQuantityProblem = 'above-note' | 'missing'

export type OccurrenceItemLine = Readonly<{
  /** O valor pago digitado, canônico — só quando o valor se digita por linha. */
  declaredAmount: string | undefined
  draft: OccurrenceItemDraft
  /** O valor pago exigido nesta linha: o tipo o exige, ou o preço varia na nota. */
  isDeclaredAmountRequired: boolean
  isSelected: boolean
  /** O valor pago da linha, senão a soma dela. */
  itemAmountCents: bigint | undefined
  /** Quantidade × valor unitário, centavos. */
  lineAmountCents: bigint | undefined
  product: DriverNfeProduct
  /** A quantidade canônica (texto com ponto), só quando válida. */
  quantity: string | undefined
  quantityProblem: OccurrenceItemQuantityProblem | undefined
}>

export type OccurrenceTotals = Readonly<{
  /** O valor pago da ocorrência, senão a soma dos valores das linhas. */
  declaredAmountCents: bigint | null
  itemsSumCents: bigint | null
}>

/** O corpo do `POST`: dinheiro e quantidade sempre `string`, nunca `number`; preço e unidade, nunca. */
export type OccurrenceValuesPayload = Readonly<{
  declaredAmount?: string
  items?: readonly Readonly<{
    declaredAmount?: string
    productCode: string
    quantity: string
  }>[]
  referenceNumber?: string
}>

export type OccurrenceValues = Readonly<{
  /** Onde o valor pago se digita agora: por produto ou uma vez na ocorrência. */
  amountTarget: DeclaredAmountScope
  facts: OccurrenceValuesFacts
  lines: readonly OccurrenceItemLine[]
  payload: OccurrenceValuesPayload
  /** `undefined` quando não há o que somar. */
  totals: OccurrenceTotals | undefined
}>

type ItemLineParams = Readonly<{
  draft: OccurrenceItemDraft
  isAmountOnLine: boolean
  product: DriverNfeProduct
  requirements: OccurrenceRequirements
}>

function readCanonicalAmount(text: string): string | undefined {
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

function buildItemLine(params: ItemLineParams): OccurrenceItemLine {
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
        ? selected.filter((line) => line.isDeclaredAmountRequired && line.declaredAmount === undefined)
            .length
        : 0,
    },
    lines,
    payload: buildPayload({ declaredAmount, lines, referenceNumber }),
    totals: buildTotals({ declaredAmount, lines }),
  }
}
