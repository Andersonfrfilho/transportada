/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Cópia por valor de `COMPANY_FEDERAL_REGIMES` da API, conferida pelo contrato do painel. */
export const FEDERAL_REGIMES = ['simple', 'presumed', 'real'] as const

export type FederalRegime = (typeof FEDERAL_REGIMES)[number]

/** O que a empresa declarou — alíquotas em **fração** (`0.006500`), nunca em percentual. */
export type FederalTaxSettings = Readonly<{
  cofinsRate: string
  federalRegime: FederalRegime
  pisRate: string
  updatedAt: string
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function isFederalRegime(value: unknown): value is FederalRegime {
  return FEDERAL_REGIMES.some((regime) => regime === value)
}

export function isFederalTaxSettings(value: unknown): value is FederalTaxSettings {
  return (
    isRecord(value) &&
    isFederalRegime(value.federalRegime) &&
    typeof value.pisRate === 'string' &&
    typeof value.cofinsRate === 'string' &&
    typeof value.updatedAt === 'string'
  )
}

/** `{ data: null }` é "não declarado" — resposta válida, não erro. */
export function isFederalTaxResponse(
  value: unknown,
): value is Readonly<{ data: FederalTaxSettings | null }> {
  return (
    isRecord(value) && 'data' in value && (value.data === null || isFederalTaxSettings(value.data))
  )
}
