/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import { getTripFinancialsClient } from '../shared/tripFinancialsClient.service'
import {
  summarizeTripValuation,
  type TripValuation,
  type TripValuationSummary,
} from '../shared/tripValuation.service'

const TRIP_VALUATION_PREVIEW_QUERY_KEY = 'trip-valuation-preview'
const FINANCIALS_PERMISSION = 'trip.financials'

export type TripValuationPreviewController = Readonly<{
  canRead: boolean
  isLoading: boolean
  summary: TripValuationSummary | null
  /** As parcelas, para a tela mostrar **como** o total foi formado, não só o total. */
  valuation: TripValuation | null
}>

/**
 * A conta da viagem **antes de ela existir**: quem monta o roteiro decide se vale a pena montá-lo, e
 * essa decisão precisa de custo e receita lado a lado — a receita sozinha não diz nada.
 *
 * ⚠️ Como no painel da viagem aberta, a consulta **só liga com a permissão**. Sem ela a tela não
 * pergunta: pedir e receber 403 encheria o log de recusa esperada, e o bloco nem aparece.
 *
 * A chave inclui as notas ordenadas porque a escolha muda a cada clique e o resultado é dela; sem a
 * ordenação, a mesma seleção em ordem diferente viraria uma consulta nova a cada render.
 */
export function useTripValuationPreview(
  input: Readonly<{
    driverIds: readonly string[]
    nfeDocumentIds: readonly string[]
    permissions: readonly string[]
    vehicleId: string
  }>,
): TripValuationPreviewController {
  const canRead = input.permissions.includes(FINANCIALS_PERMISSION)
  const documentKey = [...input.nfeDocumentIds].sort().join(',')
  const driverKey = [...input.driverIds].sort().join(',')

  const query = useQuery({
    /** Sem nota ou sem veículo a API recusaria: a pergunta só existe com os dois. */
    enabled: canRead && input.nfeDocumentIds.length > 0 && input.vehicleId !== '',
    queryFn: () =>
      getTripFinancialsClient().previewValuation({
        driverIds: input.driverIds,
        nfeDocumentIds: input.nfeDocumentIds,
        vehicleId: input.vehicleId,
      }),
    queryKey: [TRIP_VALUATION_PREVIEW_QUERY_KEY, documentKey, driverKey, input.vehicleId],
  })

  const valuation = query.data ?? null

  return {
    canRead,
    isLoading: query.isLoading,
    summary: summarizeTripValuation(valuation),
    valuation,
  }
}
