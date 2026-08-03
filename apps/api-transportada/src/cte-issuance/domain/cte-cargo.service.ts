/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteQuantidadeCarga } from '@adatechnology/fiscal-provider'

import {
  MONEY_SCALE,
  formatScaledDecimal,
  parseScaledDecimal,
} from '../../shared/decimal.service.js'

import { CtePayloadUnresolvedPredominantProductError } from './cte-payload.error.js'
import type {
  CtePayloadInvoice,
  CtePayloadProduct,
  CtePayloadProfile,
} from './cte-payload.types.js'

const ERROR_CODE_PREFIX = 'CTE_PAYLOAD'
const WEIGHT_SCALE = MONEY_SCALE

const CARGO_MEASURE = {
  GROSS_WEIGHT: 'PESO BRUTO',
  NET_WEIGHT: 'PESO LIQUIDO',
  UNIT: 'UN',
} as const

const CARGO_UNIT = {
  KILOGRAM: '01',
  UNIT: '03',
} as const

type CargoTotals = {
  readonly grossWeight: bigint
  readonly netWeight: bigint
  readonly quantity: bigint
}

type CalculatedPredominantMode = Exclude<CtePayloadProfile['predominantProductMode'], 'fixed'>

type MagnitudeResolver = (invoicePosition: number, product: CtePayloadProduct) => bigint

type PredominantCandidate = {
  readonly description: string
  readonly invoicePosition: number
  readonly magnitude: bigint
  readonly ordinal: number
  readonly totalValue: bigint
}

function parseAmount(value: null | string): bigint {
  if (value === null) return 0n
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: WEIGHT_SCALE, value })
}

function sumTotals(invoices: readonly CtePayloadInvoice[]): CargoTotals {
  let grossWeight = 0n
  let netWeight = 0n
  let quantity = 0n

  for (const invoice of invoices) {
    for (const volume of invoice.volumes) {
      grossWeight += parseAmount(volume.grossWeight)
      netWeight += parseAmount(volume.netWeight)
      quantity += parseAmount(volume.quantity)
    }
  }

  return { grossWeight, netWeight, quantity }
}

function toQuantity(value: bigint): number {
  return Number(formatScaledDecimal(value, WEIGHT_SCALE))
}

export function composeCargoQuantities(
  invoices: readonly CtePayloadInvoice[],
): readonly CteQuantidadeCarga[] {
  const totals = sumTotals(invoices)
  const quantities: CteQuantidadeCarga[] = []

  if (totals.quantity > 0n) {
    quantities.push({
      cUnid: CARGO_UNIT.UNIT,
      qCarga: toQuantity(totals.quantity),
      tpMed: CARGO_MEASURE.UNIT,
    })
  }
  if (totals.grossWeight > 0n) {
    quantities.push({
      cUnid: CARGO_UNIT.KILOGRAM,
      qCarga: toQuantity(totals.grossWeight),
      tpMed: CARGO_MEASURE.GROSS_WEIGHT,
    })
  }
  if (totals.netWeight > 0n) {
    quantities.push({
      cUnid: CARGO_UNIT.KILOGRAM,
      qCarga: toQuantity(totals.netWeight),
      tpMed: CARGO_MEASURE.NET_WEIGHT,
    })
  }

  return quantities
}

function sumVolumeGrossWeight(invoice: CtePayloadInvoice): bigint {
  let total = 0n
  for (const volume of invoice.volumes) total += parseAmount(volume.grossWeight)
  return total
}

/** Peso por item só escolhe o produto predominante se todos os itens do grupo o declararem. */
function hasWeightOnEveryProduct(invoices: readonly CtePayloadInvoice[]): boolean {
  let hasProduct = false

  for (const invoice of invoices) {
    for (const product of invoice.products) {
      if (parseAmount(product.grossWeight) <= 0n) return false
      hasProduct = true
    }
  }

  return hasProduct
}

function buildMagnitudeResolver(
  invoices: readonly CtePayloadInvoice[],
  mode: CalculatedPredominantMode,
): MagnitudeResolver {
  if (mode === 'highest_quantity') return (_position, product) => parseAmount(product.quantity)
  if (mode === 'highest_value') return (_position, product) => parseAmount(product.totalValue)
  if (hasWeightOnEveryProduct(invoices)) {
    return (_position, product) => parseAmount(product.grossWeight)
  }

  // Sem peso em todos os itens vale o peso do volume, que é a declaração legal da carga.
  const volumeWeights = invoices.map(sumVolumeGrossWeight)
  return (position) => volumeWeights[position] ?? 0n
}

function isBetterCandidate(
  candidate: PredominantCandidate,
  current: null | PredominantCandidate,
): boolean {
  if (current === null) return true
  if (candidate.magnitude !== current.magnitude) return candidate.magnitude > current.magnitude
  if (candidate.totalValue !== current.totalValue) return candidate.totalValue > current.totalValue
  if (candidate.ordinal !== current.ordinal) return candidate.ordinal < current.ordinal
  return candidate.invoicePosition < current.invoicePosition
}

function resolveByHighest(
  invoices: readonly CtePayloadInvoice[],
  mode: CalculatedPredominantMode,
): null | string {
  const resolveMagnitude = buildMagnitudeResolver(invoices, mode)
  let best: null | PredominantCandidate = null

  for (const [invoicePosition, invoice] of invoices.entries()) {
    for (const product of invoice.products) {
      const magnitude = resolveMagnitude(invoicePosition, product)
      if (magnitude <= 0n) continue

      const candidate: PredominantCandidate = {
        description: product.description,
        invoicePosition,
        magnitude,
        ordinal: product.ordinal,
        totalValue: parseAmount(product.totalValue),
      }
      if (isBetterCandidate(candidate, best)) best = candidate
    }
  }

  return best?.description ?? null
}

export function resolvePredominantProduct(
  input: Readonly<{
    invoices: readonly CtePayloadInvoice[]
    profile: CtePayloadProfile
  }>,
): string {
  const { invoices, profile } = input
  const mode = profile.predominantProductMode

  if (mode === 'fixed') {
    const name = profile.predominantProductName ?? ''
    if (name.length === 0) throw new CtePayloadUnresolvedPredominantProductError(mode)
    return name
  }

  const resolved = resolveByHighest(invoices, mode)
  if (resolved === null) throw new CtePayloadUnresolvedPredominantProductError(mode)
  return resolved
}
