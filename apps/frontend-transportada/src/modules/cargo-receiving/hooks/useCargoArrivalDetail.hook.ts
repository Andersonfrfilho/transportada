/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useState } from 'react'

import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import {
  useAssignRouteMutation,
  useBatchStatusMutation,
  useCloseCargoArrivalMutation,
} from '../mutations/useCargoArrivalActions.mutation'
import { useCargoArrivalQuery } from '../queries/useCargoArrivals.query'
import type {
  CargoArrivalDetail,
  CargoDocumentOutcome,
  CargoTransitionTarget,
} from '../shared/cargoArrival.types'
import {
  describePendingDocuments,
  type DocumentReference,
  type PendingDocument,
} from '../shared/cargoReceivingRefusal.service'
import {
  navigateToCargoArrivalSeparation,
  navigateToCargoArrivals,
} from '../shared/cargoReceivingRoute.service'
import {
  useCargoArrivalSelection,
  type CargoArrivalSelectionController,
} from './useCargoArrivalSelection.hook'

export type CargoArrivalDetailController = Readonly<{
  arrival: CargoArrivalDetail | undefined
  assignRoute: (routeName: string) => void
  close: () => void
  closeErrorCode: string | undefined
  dismissOutcome: () => void
  documents: readonly DocumentReference[]
  errorCode: string | undefined
  isLoading: boolean
  isWorking: boolean
  openList: () => void
  openSeparation: () => void
  outcomes: readonly CargoDocumentOutcome[] | undefined
  pending: readonly PendingDocument[]
  routeApplied: boolean
  selection: CargoArrivalSelectionController
  setStatus: (to: CargoTransitionTarget) => void
}>

/** O detalhe do escritório: seleção entre grupos, ações em lote e o resultado por nota de cada uma. */
export function useCargoArrivalDetail(arrivalId: string): CargoArrivalDetailController {
  const query = useCargoArrivalQuery(arrivalId)
  const batch = useBatchStatusMutation(arrivalId)
  const route = useAssignRouteMutation(arrivalId)
  const close = useCloseCargoArrivalMutation(arrivalId)
  const selection = useCargoArrivalSelection()
  const [outcomes, setOutcomes] = useState<readonly CargoDocumentOutcome[] | undefined>(undefined)
  const [routeApplied, setRouteApplied] = useState(false)
  const navigator = useMemo(createBrowserWorkspaceNavigator, [])
  const arrival = query.data

  const documents = useMemo(
    () =>
      (arrival?.groups ?? []).flatMap((group) =>
        group.documents.map((document) => ({
          id: document.nfeDocumentId,
          number: document.number,
        })),
      ),
    [arrival],
  )

  function dismissOutcome(): void {
    setOutcomes(undefined)
    setRouteApplied(false)
  }

  return {
    arrival,
    assignRoute: (routeName) => {
      dismissOutcome()
      close.reset()
      const trimmed = routeName.trim()
      route.mutate(
        { documentIds: [...selection.selected], routeName: trimmed === '' ? null : trimmed },
        { onSuccess: () => setRouteApplied(true) },
      )
    },
    close: () => {
      dismissOutcome()
      close.mutate()
    },
    closeErrorCode: close.error instanceof Error ? close.error.message : undefined,
    dismissOutcome,
    documents,
    errorCode: query.error instanceof Error ? query.error.message : undefined,
    isLoading: query.isLoading,
    isWorking: batch.isPending || route.isPending || close.isPending,
    openList: () => navigateToCargoArrivals(navigator),
    openSeparation: () => navigateToCargoArrivalSeparation({ arrivalId, navigator }),
    outcomes,
    pending: describePendingDocuments({ documents, error: close.error }),
    routeApplied,
    selection,
    setStatus: (to) => {
      dismissOutcome()
      close.reset()
      batch.mutate({ documentIds: [...selection.selected], to }, { onSuccess: setOutcomes })
    },
  }
}
