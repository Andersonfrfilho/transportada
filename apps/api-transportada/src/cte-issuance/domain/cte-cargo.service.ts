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
import type { CtePayloadInvoice, CtePayloadProfile } from './cte-payload.types.js'

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

function parseWeight(value: null | string): bigint {
  if (value === null) return 0n
  return parseScaledDecimal({ errorCodePrefix: ERROR_CODE_PREFIX, scale: WEIGHT_SCALE, value })
}

function sumTotals(invoices: readonly CtePayloadInvoice[]): CargoTotals {
  let grossWeight = 0n
  let netWeight = 0n
  let quantity = 0n

  for (const invoice of invoices) {
    for (const volume of invoice.volumes) {
      grossWeight += parseWeight(volume.grossWeight)
      netWeight += parseWeight(volume.netWeight)
      quantity += parseWeight(volume.quantity)
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

function resolveByHighest(
  invoices: readonly CtePayloadInvoice[],
  pick: (product: CtePayloadInvoice['products'][number]) => null | string,
): null | string {
  let description: null | string = null
  let highest = 0n

  for (const invoice of invoices) {
    for (const product of invoice.products) {
      const raw = pick(product)
      if (raw === null) continue
      const value = parseScaledDecimal({
        errorCodePrefix: ERROR_CODE_PREFIX,
        scale: MONEY_SCALE,
        value: raw,
      })
      if (value <= highest) continue
      description = product.description
      highest = value
    }
  }

  return description
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

  const resolved =
    mode === 'highest_weight'
      ? resolveByHighest(invoices, (product) => product.grossWeight)
      : resolveByHighest(invoices, (product) => product.totalValue)

  if (resolved === null) throw new CtePayloadUnresolvedPredominantProductError(mode)
  return resolved
}
