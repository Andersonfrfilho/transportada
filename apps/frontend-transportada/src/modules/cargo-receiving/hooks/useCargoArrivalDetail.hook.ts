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
  describeRegistrationRefusal,
  referDocuments,
  type DocumentReference,
  type PendingDocument,
  type RegistrationRefusal,
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
  batchErrorCode: string | undefined
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
  routeErrorCode: string | undefined
  /** As notas e os campos que o servidor recusou, lidos pela seleção que foi enviada. */
  actionRefusal: RegistrationRefusal | undefined
  selection: CargoArrivalSelectionController
  setStatus: (to: CargoTransitionTarget) => void
}>

function readErrorCode(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

type FailedAction = Readonly<{
  documents: readonly DocumentReference[]
  error: unknown
  ids: readonly string[] | undefined
}>

/** `documentIds.<n>` do servidor é a posição da nota NA SELEÇÃO ENVIADA, não na tela: lê-se por ela. */
function describeFailedAction(input: FailedAction): RegistrationRefusal | undefined {
  if (input.error === null) return undefined
  return describeRegistrationRefusal({
    error: input.error,
    requestedDocuments: referDocuments({ documents: input.documents, ids: input.ids ?? [] }),
  })
}

/** O detalhe do escritório: seleção entre grupos, ações em lote e o resultado por nota de cada uma. */
export function useCargoArrivalDetail(arrivalId: string): CargoArrivalDetailController {
  const query = useCargoArrivalQuery(arrivalId)
  const batch = useBatchStatusMutation(arrivalId)
  const route = useAssignRouteMutation(arrivalId)
  const close = useCloseCargoArrivalMutation(arrivalId)
  const pickedSelection = useCargoArrivalSelection()
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

  // Rota e lote nunca falham juntos: cada um limpa o aviso do outro ao começar.
  const failedAction =
    route.error === null
      ? { error: batch.error, ids: batch.variables?.documentIds }
      : { error: route.error, ids: route.variables?.documentIds }

  function clearActionErrors(): void {
    route.reset()
    batch.reset()
  }

  /** Editar a seleção invalida o aviso: ele falava de outro conjunto de notas. */
  const selection: CargoArrivalSelectionController = {
    clear: () => {
      clearActionErrors()
      pickedSelection.clear()
    },
    selected: pickedSelection.selected,
    toggleDocument: (documentId) => {
      clearActionErrors()
      pickedSelection.toggleDocument(documentId)
    },
    toggleGroup: (group) => {
      clearActionErrors()
      pickedSelection.toggleGroup(group)
    },
  }

  return {
    arrival,
    assignRoute: (routeName) => {
      dismissOutcome()
      close.reset()
      batch.reset()
      const trimmed = routeName.trim()
      route.mutate(
        { documentIds: [...selection.selected], routeName: trimmed === '' ? null : trimmed },
        { onSuccess: () => setRouteApplied(true) },
      )
    },
    batchErrorCode: readErrorCode(batch.error),
    close: () => {
      dismissOutcome()
      clearActionErrors()
      close.mutate()
    },
    closeErrorCode: readErrorCode(close.error),
    dismissOutcome,
    documents,
    errorCode: readErrorCode(query.error),
    isLoading: query.isLoading,
    isWorking: batch.isPending || route.isPending || close.isPending,
    openList: () => navigateToCargoArrivals(navigator),
    openSeparation: () => navigateToCargoArrivalSeparation({ arrivalId, navigator }),
    outcomes,
    pending: describePendingDocuments({ documents, error: close.error }),
    routeApplied,
    routeErrorCode: readErrorCode(route.error),
    actionRefusal: describeFailedAction({ documents, ...failedAction }),
    selection,
    setStatus: (to) => {
      dismissOutcome()
      close.reset()
      route.reset()
      batch.mutate({ documentIds: [...selection.selected], to }, { onSuccess: setOutcomes })
    },
  }
}
