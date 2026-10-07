/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'
import { navigateToTrip, navigateToTripCreation } from '@/modules/trip/shared/tripRoute.service'

import { useCargoPreviewTripDraftsQuery } from '../queries/useCargoPreviewTripDrafts.query'
import {
  cargoPreviewDetailQueryKey,
  CARGO_PREVIEWS_LIST_KEY,
} from '../queries/useCargoPreviews.query'
import type {
  CargoPreviewTripDraftRoute,
  CargoPreviewTripDrafts,
} from '../shared/cargoPreviewTripDraft.types'
import {
  parseTripDraftView,
  resolveTripDraftCreationIds,
  resolveTripDraftSolverScope,
  serializeTripDraftView,
  type CargoTripDraftSolverScope,
  type CargoTripDraftView,
} from '../shared/cargoPreviewTripDraftView.service'

export type CargoPreviewTripDraftsController = Readonly<{
  clearRoute: () => void
  close: () => void
  /** Leva ao fluxo de criação de viagem com as notas roteáveis do roteiro. Nada é criado aqui. */
  createTrip: (route: CargoPreviewTripDraftRoute) => void
  drafts: CargoPreviewTripDrafts | undefined
  errorCode: string | undefined
  /** Aceitar uma proposta muda o que está em viagem viva: os rascunhos são relidos no servidor. */
  handleAccepted: () => void
  isLoading: boolean
  isOpen: boolean
  open: () => void
  openTrip: (tripId: string) => void
  scope: CargoTripDraftSolverScope | undefined
  selectedRouteName: string | undefined
  toggleRoute: (routeName: string) => void
}>

/** A recomendação aberta e o roteiro escolhido moram na URL, escrita no próprio gesto, ao lado dos filtros do detalhe. */
export function useCargoPreviewTripDrafts(
  input: Readonly<{ previewId: string }>,
): CargoPreviewTripDraftsController {
  const { previewId } = input
  const queryClient = useQueryClient()
  const navigator = useMemo(createBrowserWorkspaceNavigator, [])
  const [view, setView] = useState<CargoTripDraftView>(() =>
    parseTripDraftView(window.location.search),
  )
  const query = useCargoPreviewTripDraftsQuery({ isEnabled: view.isOpen, previewId })
  const drafts = query.data
  const scope = useMemo(
    () =>
      drafts === undefined
        ? undefined
        : resolveTripDraftSolverScope({ drafts, selectedRouteName: view.routeName }),
    [drafts, view.routeName],
  )

  function commit(next: CargoTripDraftView): void {
    setView(next)
    const search = serializeTripDraftView({ search: window.location.search, view: next })
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}`)
  }

  return {
    clearRoute: () => commit({ ...view, routeName: undefined }),
    close: () => commit({ isOpen: false, routeName: undefined }),
    createTrip: (route) => {
      const documentIds = resolveTripDraftCreationIds(route)
      if (documentIds.length === 0) return
      navigateToTripCreation({ documentIds, navigator })
    },
    drafts,
    errorCode: query.error instanceof Error ? query.error.message : undefined,
    handleAccepted: () => {
      // A chave dos rascunhos mora debaixo da do detalhe: invalidar o detalhe os relê, uma vez só.
      void queryClient.invalidateQueries({ queryKey: cargoPreviewDetailQueryKey(previewId) })
      void queryClient.invalidateQueries({ queryKey: CARGO_PREVIEWS_LIST_KEY })
    },
    isLoading: view.isOpen && query.isLoading,
    isOpen: view.isOpen,
    open: () => commit({ ...view, isOpen: true }),
    openTrip: (tripId) => navigateToTrip({ navigator, tripId }),
    scope,
    selectedRouteName: scope === undefined ? view.routeName : scope.routeName,
    toggleRoute: (routeName) =>
      commit({ ...view, routeName: view.routeName === routeName ? undefined : routeName }),
  }
}
