/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { DriverNfeProduct } from './driverTrip.types'
import type { DeclaredAmountScope, OccurrenceValuesFacts } from './occurrenceRequirements.service'

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
