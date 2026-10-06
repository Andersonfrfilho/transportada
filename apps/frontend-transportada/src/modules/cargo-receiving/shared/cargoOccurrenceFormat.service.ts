/* Copyright (c) 2026 Ada Technology. MIT License. */
import { CARGO_OCCURRENCE_FALLBACK_UNITS } from './cargoOccurrence.constant'
import type { CargoOccurrenceItem } from './cargoOccurrence.types'

const MAXIMUM_QUANTITY_DECIMALS = 3

type UnitLabels = Readonly<Record<(typeof CARGO_OCCURRENCE_FALLBACK_UNITS)[number], string>>

/**
 * A quantidade vem do banco como decimal de três casas ("1.000"), e "1.000" em português lê como MIL — uma
 * caixa avariada viraria mil na leitura de quem confere. Aqui ela vira número do idioma da tela, sem zero à toa.
 */
export function formatOccurrenceQuantity(
  input: Readonly<{ locale: string; quantity: string }>,
): string {
  const value = Number(input.quantity)
  if (!Number.isFinite(value)) return input.quantity
  return new Intl.NumberFormat(input.locale, {
    maximumFractionDigits: MAXIMUM_QUANTITY_DECIMALS,
  }).format(value)
}

function isFallbackUnit(unit: string): unit is keyof UnitLabels {
  return (CARGO_OCCURRENCE_FALLBACK_UNITS as readonly string[]).includes(unit)
}

/** "3 KG": a unidade comercial sai como a nota a escreve, só caixa e unidade têm nome no dicionário. */
export function formatOccurrenceItemQuantity(
  input: Readonly<{ item: CargoOccurrenceItem; locale: string; unitLabels: UnitLabels }>,
): string | undefined {
  const { item } = input
  if (item.quantity === null || item.unit === null) return undefined
  const unit = isFallbackUnit(item.unit) ? input.unitLabels[item.unit] : item.unit
  return `${formatOccurrenceQuantity({ locale: input.locale, quantity: item.quantity })} ${unit}`
}
