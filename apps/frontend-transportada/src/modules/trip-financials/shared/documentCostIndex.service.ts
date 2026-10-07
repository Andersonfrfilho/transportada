/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TripValuation, TripValuationRevenueLine } from './tripValuation.service'

/**
 * Spec 232 RF4/RF6: a linha da nota procura o seu gasto por `tripDocumentId`. Sem avaliação — quem
 * não tem `trip.financials` nunca a recebe — o índice é vazio, e a nota não imprime nada.
 */
export function indexRevenueLinesByDocument(
  valuation: null | TripValuation,
): ReadonlyMap<string, TripValuationRevenueLine> {
  const lines = valuation?.revenueLines ?? []

  return new Map(lines.map((line) => [line.tripDocumentId, line]))
}
