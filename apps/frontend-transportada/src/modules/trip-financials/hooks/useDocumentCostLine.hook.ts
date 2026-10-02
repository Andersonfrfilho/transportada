/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createContext, useContext } from 'react'

import type { TripValuationRevenueLine } from '../shared/tripValuation.service'

type DocumentCostLines = ReadonlyMap<string, TripValuationRevenueLine>

/** Sem provedor o mapa é vazio: a nota fora do painel financeiro fica exatamente como era. */
export const DocumentCostContext = createContext<DocumentCostLines>(new Map())

export function useDocumentCostLine(documentId: string): TripValuationRevenueLine | undefined {
  return useContext(DocumentCostContext).get(documentId)
}
