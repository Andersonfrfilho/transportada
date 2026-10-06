/* Copyright (c) 2026 Ada Technology. MIT License. */
import { type ReactNode, useMemo } from 'react'

import { DocumentCostContext } from '../hooks/useDocumentCostLine.hook'
import { indexRevenueLinesByDocument } from '../shared/documentCostIndex.service'
import type { TripValuation } from '../shared/tripValuation.service'

type DocumentCostProviderProps = Readonly<{
  children: ReactNode
  /** `null` quando a avaliação não veio — sem `trip.financials` ela nem é pedida. */
  valuation: null | TripValuation
}>

export function DocumentCostProvider({ children, valuation }: DocumentCostProviderProps) {
  // Um `Map` novo a cada render trocaria o valor do contexto e re-renderizaria todas as notas.
  const index = useMemo(() => indexRevenueLinesByDocument(valuation), [valuation])

  return <DocumentCostContext.Provider value={index}>{children}</DocumentCostContext.Provider>
}
