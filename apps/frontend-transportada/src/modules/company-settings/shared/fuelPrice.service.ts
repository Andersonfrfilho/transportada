/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FuelPriceSource } from './fuelPrice.validation'

/** A ANP publica quatro casas, e é a quarta que muda o R$/km quando o preço é dividido. */
const PRICE_SCALE = 4
const PRICE_DRAFT = /^(\d+)(?:[.,](\d+))?$/u
const API_PRICE = /^(?:0|[1-9][0-9]{0,14})\.[0-9]{4}$/u

export const FUEL_PRICE_SOURCE_LABEL_KEYS: Readonly<Record<FuelPriceSource, string>> = {
  anp: 'fuelPriceSourceAnp',
  manual: 'fuelPriceSourceManual',
}

const priceFormatter = new Intl.NumberFormat('pt-BR', {
  currency: 'BRL',
  maximumFractionDigits: PRICE_SCALE,
  minimumFractionDigits: PRICE_SCALE,
  style: 'currency',
})

function roundHalfUp(input: Readonly<{ fraction: string; whole: string }>): string {
  const kept = `${input.whole}${input.fraction.slice(0, PRICE_SCALE)}`
  const carry = input.fraction.charAt(PRICE_SCALE) >= '5' ? 1n : 0n
  const rounded = (BigInt(kept) + carry).toString().padStart(PRICE_SCALE + 1, '0')
  const cut = rounded.length - PRICE_SCALE
  return `${rounded.slice(0, cut)}.${rounded.slice(cut)}`
}

export function toFuelPricePerUnit(draft: string): null | string {
  const match = PRICE_DRAFT.exec(draft.trim())
  if (match === null) return null
  const whole = (match[1] ?? '').replace(/^0+(?=\d)/u, '')
  const fraction = match[2] ?? ''
  const price =
    fraction.length <= PRICE_SCALE
      ? `${whole}.${fraction.padEnd(PRICE_SCALE, '0')}`
      : roundHalfUp({ fraction, whole })
  return API_PRICE.test(price) ? price : null
}

export function formatFuelPricePerUnit(value: string): string {
  return priceFormatter.format(Number(value))
}
