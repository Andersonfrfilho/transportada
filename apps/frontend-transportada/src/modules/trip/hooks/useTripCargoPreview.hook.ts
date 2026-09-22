/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { useTripCargoLayoutQuery } from '../queries/useTripCargoLayout.query'
import {
  type CargoLayoutPendingEpisode,
  type CargoLayoutView,
  mergeCargoPreviewPoll,
  rememberShownCargoLayout,
  resolveCargoLayoutRefetchInterval,
  resolveCargoLayoutView,
  resolveCargoPreviewPollLayoutId,
  trackCargoLayoutPendingEpisode,
  withRememberedCargoLayout,
} from '../shared/cargoLayoutPolling.service'
import type { TripCargoLayout, TripCargoPreview } from '../shared/trip.types'
import { getTripClient } from './useTripWorkspace.hook'

export const TRIP_CARGO_PREVIEW_QUERY_KEY = 'trip-cargo-preview'
const TRIP_MANAGE_PERMISSION = 'trip.manage'

export type TripCargoPreviewController = Readonly<{
  canRead: boolean
  /** Spec 145 T12: `null` com API anterior à T11 — a tela segue a de hoje. */
  cargoLayoutView: CargoLayoutView | null
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
    /**
     * Spec 100: os motoristas escolhidos. ⚠️ Ele entra na chave porque **muda o desenho**: quem
     * amarra a carga empilha até o teto, e sem ele a planta ficaria a do motorista anterior.
     */
    driverIds: readonly string[]
    /**
     * ⚠️ Pausa a consulta e segura o **último número medido** enquanto há rascunho aberto na tela
     * (specs 111/112): cada toque de seta ou movimento ia ao servidor, e o operador só queria ver o
     * número depois de salvar.
     */
    isPaused?: boolean
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
  const driverKey = [...input.driverIds].sort().join(',')

  const [episode, setEpisode] = useState<CargoLayoutPendingEpisode | undefined>(undefined)
  /** Spec 145 T13: a última planta pronta exibida, que vira fantasma enquanto a nova calcula. */
  const [shownLayout, setShownLayout] = useState<TripCargoLayout | null>(null)

  const query = useQuery({
    /** Sem nota ou sem veículo a API recusaria: a pergunta só existe com os dois. */
    enabled:
      input.isPaused !== true &&
      canRead &&
      input.nfeDocumentIds.length > 0 &&
      input.vehicleId !== '',
    queryFn: () =>
      getTripClient().previewCargo({
        driverIds: input.driverIds,
        nfeDocumentIds: input.nfeDocumentIds,
        stopOrder: input.stopOrder,
        vehicleId: input.vehicleId,
      }),
    placeholderData: (previous) => (input.isPaused === true ? previous : undefined),
    queryKey: [TRIP_CARGO_PREVIEW_QUERY_KEY, documentKey, orderKey, input.vehicleId, driverKey],
  })

  /**
   * Spec 145 T12: prévia `pending` pergunta pelo `layoutId` a cada 3 s, até o teto. Nova entrada é
   * novo POST, novo id e nova consulta; a resposta da anterior só entra se o id bater.
   */
  const pollLayoutId = resolveCargoPreviewPollLayoutId(query.data ?? null) ?? ''
  const pollQuery = useTripCargoLayoutQuery({
    enabled: canRead,
    layoutId: pollLayoutId,
    refetchInterval: (poll) => {
      const status = poll.state.data?.state.status
      const now = poll.state.dataUpdatedAt
      const current = trackCargoLayoutPendingEpisode({
        key: pollLayoutId,
        now,
        previous: episode,
        status,
      })
      return resolveCargoLayoutRefetchInterval({ episode: current, now, status })
    },
  })
  const preview = mergeCargoPreviewPoll({ poll: pollQuery.data, preview: query.data ?? null })
  const now = Math.max(query.dataUpdatedAt, pollQuery.dataUpdatedAt)
  const nextEpisode = trackCargoLayoutPendingEpisode({
    key: preview?.layoutId ?? '',
    now,
    previous: episode,
    status: preview?.state?.status,
  })
  if (nextEpisode !== episode) setEpisode(nextEpisode)
  const servedView = resolveCargoLayoutView({
    episode: nextEpisode,
    layout: preview?.cargoLayout ?? null,
    now,
    state: preview?.state,
  })
  const nextShownLayout = rememberShownCargoLayout({ previous: shownLayout, view: servedView })
  if (nextShownLayout !== shownLayout) setShownLayout(nextShownLayout)
  const cargoLayoutView = withRememberedCargoLayout({
    remembered: nextShownLayout,
    view: servedView,
  })

  return { canRead, cargoLayoutView, isLoading: query.isLoading, preview }
}
