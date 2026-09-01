/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { FinancialParcel, TripFinancialResult } from './tripFinancials.types'

/**
 * ADR-0049 §2: **a origem aparece ao lado do número.** Uma margem de 18% que na verdade é "18% se o
 * combustível estiver certo" leva a decisão errada com mais confiança do que número nenhum levaria.
 */
export function splitParcels(result: TripFinancialResult): Readonly<{
  costs: readonly FinancialParcel[]
  taxes: readonly FinancialParcel[]
}> {
  return {
    costs: result.parcels.filter((parcel) => parcel.nature === 'cost'),
    taxes: result.parcels.filter((parcel) => parcel.nature === 'tax'),
  }
}

/** Quantas parcelas o operador precisa cadastrar para o número parar de ser aproximação. */
export function countUnknownParcels(result: TripFinancialResult): number {
  return result.parcels.filter((parcel) => parcel.source === 'missing').length
}

/**
 * Margem negativa aparece **negativa**, e em destaque. Esconder ou zerar seria decidir pela pessoa
 * que precisa justamente dessa informação.
 */
export function isNegative(amount: string): boolean {
  return amount.trim().startsWith('-')
}

/** `null` quando não houve receita: margem sobre zero é −100% e engana. */
export function formatMargin(marginRate: string | null): string | null {
  if (marginRate === null) return null
  const [integer = '0', fraction = ''] = marginRate.split('.')

  return `${integer},${`${fraction}00`.slice(0, 2)}%`
}

/** "8 de 10 notas" é o que a tela mostra quando a receita ainda não está inteira. */
export function describeRevenueCoverage(result: TripFinancialResult): null | Readonly<{
  expected: number
  measured: number
}> {
  if (result.revenueDocumentCount === result.revenueExpectedCount) return null

  return { expected: result.revenueExpectedCount, measured: result.revenueDocumentCount }
}
