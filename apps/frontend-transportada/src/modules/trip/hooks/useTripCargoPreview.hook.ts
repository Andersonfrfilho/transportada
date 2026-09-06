/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'

import type { TripCargoPreview } from '../shared/trip.types'
import { getTripClient } from './useTripWorkspace.hook'

const TRIP_CARGO_PREVIEW_QUERY_KEY = 'trip-cargo-preview'
const TRIP_MANAGE_PERMISSION = 'trip.manage'

export type TripCargoPreviewController = Readonly<{
  canRead: boolean
  isLoading: boolean
  preview: TripCargoPreview | null
}>

/**
 * A carga desenhada **antes de a viagem existir**: cabe no baú, e em que ordem entra.
 *
 * ⚠️ A permissão é `trip.manage`, não `trip.financials`: quem monta a viagem precisa saber se cabe,
 * e o separador monta sem enxergar receita nem custo. Sem ela a tela **não pergunta** — pedir e
 * receber 403 encheria o log de recusa esperada.
 *
 * A chave carrega as notas ordenadas e a ordem das paradas: a primeira porque a seleção muda a cada
 * clique e o resultado é dela, a segunda porque reordenar o roteiro muda quem viaja no fundo.
 */
export function useTripCargoPreview(
  input: Readonly<{
    nfeDocumentIds: readonly string[]
    permissions: readonly string[]
    stopOrder: readonly string[]
    vehicleId: string
  }>,
): TripCargoPreviewController {
  const canRead = input.permissions.includes(TRIP_MANAGE_PERMISSION)
  const documentKey = [...input.nfeDocumentIds].sort().join(',')
  /** ⚠️ **Sem `sort`**: aqui a ordem *é* o dado — ordenar a chave esconderia a reordenação. */
  const orderKey = input.stopOrder.join('>')

  const query = useQuery({
    /** Sem nota ou sem veículo a API recusaria: a pergunta só existe com os dois. */
    enabled: canRead && input.nfeDocumentIds.length > 0 && input.vehicleId !== '',
    queryFn: () =>
      getTripClient().previewCargo({
        nfeDocumentIds: input.nfeDocumentIds,
        stopOrder: input.stopOrder,
        vehicleId: input.vehicleId,
      }),
    queryKey: [TRIP_CARGO_PREVIEW_QUERY_KEY, documentKey, orderKey, input.vehicleId],
  })

  return { canRead, isLoading: query.isLoading, preview: query.data ?? null }
}
