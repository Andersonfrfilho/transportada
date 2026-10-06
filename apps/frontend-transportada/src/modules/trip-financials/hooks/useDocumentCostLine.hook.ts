/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createContext, useContext } from 'react'

import { hasRevenueLineCost } from '../shared/revenueLineCost.service'
import type { TripValuationRevenueLine } from '../shared/tripValuation.service'

type DocumentCostLines = ReadonlyMap<string, TripValuationRevenueLine>

/** Sem provedor o mapa é vazio: a nota fora do painel financeiro fica exatamente como era. */
export const DocumentCostContext = createContext<DocumentCostLines>(new Map())

export function useDocumentCostLine(documentId: string): TripValuationRevenueLine | undefined {
  return useContext(DocumentCostContext).get(documentId)
}

/** A nota tem o que mostrar no detalhe: o gasto e o lucro, ou o motivo de não haver. */
export function useHasDocumentCost(documentId: string): boolean {
  const line = useDocumentCostLine(documentId)

  return line !== undefined && hasRevenueLineCost(line)
}
