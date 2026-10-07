/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 247 (RF13, RF14, T4.8): o que a correção (167/240) faz com o número do documento do cliente e
 * com os valores pagos. Ausente na requisição é "mantém o gravado"; nulo é "limpa"; texto é "passa a
 * valer". O valor unitário de um código que já estava na ocorrência é o COPIADO no registro (história
 * imutável); o de um código novo sai da nota — nunca do corpo.
 */
import { parseScaledDecimal } from './occurrence-amount.policy.js'
import type { OccurrenceItemQuantity } from './occurrence-item-quantity.policy.js'
import type { DocumentProductPricing } from './occurrence-product-pricing.policy.js'
import {
  OccurrenceDeclaredAmountLevelConflictError,
  OccurrenceItemQuantityAboveDocumentError,
} from './trip.error.js'

/** A linha como a ocorrência a guarda: a da 166 mais o que a 247 copia e digita. */
export type StoredOccurrenceLineValues = OccurrenceItemQuantity & {
  readonly declaredAmount: null | string
  readonly unitValue: null | string
}

/** Ausente (`undefined`) mantém, `null` limpa, texto passa a valer. */
export type TriStateText = null | string | undefined

type BuildCorrectedLinesParams = {
  readonly declaredAmounts: readonly TriStateText[]
  readonly nextItems: readonly OccurrenceItemQuantity[]
  readonly previousLines: readonly StoredOccurrenceLineValues[]
  readonly pricing: ReadonlyMap<string, DocumentProductPricing>
}

function quantityField(index: number): string {
  return `items[${String(index)}].quantity`
}

function isAboveDocument(item: OccurrenceItemQuantity, pricing: DocumentProductPricing): boolean {
  if (item.quantity === null || item.unit !== pricing.commercialUnit) return false
  return parseScaledDecimal(item.quantity) > parseScaledDecimal(pricing.totalQuantity)
}

export function buildCorrectedOccurrenceLines(
  params: BuildCorrectedLinesParams,
): readonly StoredOccurrenceLineValues[] {
  const previousByCode = new Map(params.previousLines.map((line) => [line.code, line]))

  return params.nextItems.map((item, index) => {
    const pricing = params.pricing.get(item.code.trim())
    if (pricing !== undefined && isAboveDocument(item, pricing)) {
      throw new OccurrenceItemQuantityAboveDocumentError(quantityField(index))
    }
    const previous = previousByCode.get(item.code)
    const requested = params.declaredAmounts[index]
    return {
      ...item,
      declaredAmount: requested === undefined ? (previous?.declaredAmount ?? null) : requested,
      unitValue: previous?.unitValue ?? pricing?.unitValue ?? null,
    }
  })
}

type OccurrenceScalars = {
  readonly declaredAmount: null | string
  readonly referenceNumber: null | string
}

type ResolveCorrectedScalarsParams = {
  readonly declaredAmount?: TriStateText
  readonly previous: OccurrenceScalars
  readonly referenceNumber?: TriStateText
}

export type CorrectedOccurrenceScalars = OccurrenceScalars & { readonly isChanged: boolean }

/** `'50'` e `'50.0000'` são o mesmo valor; o texto do `numeric` não decide se mudou. */
function isSameAmount(left: null | string, right: null | string): boolean {
  if (left === null || right === null) return left === right
  return parseScaledDecimal(left) === parseScaledDecimal(right)
}

export function resolveCorrectedOccurrenceScalars(
  params: ResolveCorrectedScalarsParams,
): CorrectedOccurrenceScalars {
  const { previous } = params
  const referenceNumber =
    params.referenceNumber === undefined ? previous.referenceNumber : params.referenceNumber
  const declaredAmount =
    params.declaredAmount === undefined ? previous.declaredAmount : params.declaredAmount

  return {
    declaredAmount,
    isChanged:
      referenceNumber !== previous.referenceNumber ||
      !isSameAmount(declaredAmount, previous.declaredAmount),
    referenceNumber,
  }
}

/**
 * ⚠️ **Um nível só** (mesma regra do registro): valor pago da ocorrência e valor pago de linha ao mesmo
 * tempo é recusado — a soma não saberia qual dos dois é o declarado.
 */
export function assertSingleDeclaredAmountLevel(params: {
  readonly declaredAmount: null | string
  readonly lines: readonly StoredOccurrenceLineValues[]
}): void {
  const hasLineAmount = params.lines.some((line) => line.declaredAmount !== null)
  if (params.declaredAmount !== null && hasLineAmount) {
    throw new OccurrenceDeclaredAmountLevelConflictError()
  }
}
