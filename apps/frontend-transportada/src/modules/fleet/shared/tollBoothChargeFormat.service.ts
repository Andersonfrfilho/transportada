/* Copyright (c) 2026 Ada Technology. MIT License. */
import { formatRateAmount } from '@/modules/shared/decimalAmount.service'

export function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

/**
 * Tarifa com as casas que ela tem — mínimo duas, máximo quatro. Não é `formatAmount`: arredondar
 * para duas esconde o valor com tag (13,965) que o operador confere antes de digitar o ajuste.
 */
export function formatChargeOrUnknown(value: string | null, unknownLabel: string): string {
  return value === null ? unknownLabel : formatRateAmount(value)
}
