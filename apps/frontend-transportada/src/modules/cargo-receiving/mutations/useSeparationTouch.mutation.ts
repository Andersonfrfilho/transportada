/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'

import {
  CARGO_ARRIVALS_LIST_KEY,
  cargoArrivalDetailQueryKey,
} from '../queries/useCargoArrivals.query'
import type { CargoArrivalDetail, CargoArrivalDocument } from '../shared/cargoArrival.types'
import { getCargoReceivingClient } from '../shared/cargoReceivingClient.service'
import {
  applyDocumentStates,
  readDocumentStates,
  type DocumentStates,
} from '../shared/cargoDetailStates.service'
import {
  planOptimisticStates,
  resolveNextTouchTarget,
  runGroupSeparation,
  runSingleTouch,
  type TouchRun,
  type TouchSender,
} from '../shared/cargoSeparationTouch.service'

export type TouchRequest =
  | Readonly<{ document: CargoArrivalDocument; kind: 'single' }>
  | Readonly<{ documents: readonly CargoArrivalDocument[]; kind: 'group' }>

type TouchContext = Readonly<{ previousStates: DocumentStates }>

export type TouchFailure = Readonly<{
  code: string
  documentIds: readonly string[]
  request: TouchRequest
}>

export function listTouchedDocuments(request: TouchRequest): readonly CargoArrivalDocument[] {
  return request.kind === 'single' ? [request.document] : request.documents
}

/** O que a tela mostra antes de o servidor responder: o próximo passo da nota, ou o grupo todo separado. */
function planRequestStates(request: TouchRequest): DocumentStates {
  if (request.kind === 'group') return planOptimisticStates(request.documents)
  const target = resolveNextTouchTarget(request.document.separationState)
  return target === undefined ? {} : { [request.document.nfeDocumentId]: target }
}

function runRequest(request: TouchRequest, send: TouchSender): Promise<TouchRun> {
  return request.kind === 'single'
    ? runSingleTouch({ document: request.document, send })
    : runGroupSeparation({ documents: request.documents, send })
}

type SeparationTouchParams = Readonly<{
  arrivalId: string
  onFailure: (failure: TouchFailure) => void
  onResult: (run: TouchRun, request: TouchRequest) => void
}>

/**
 * Atualização otimista com volta: o toque muda a tela na hora, e o que o servidor recusar (ou o que cair
 * por falta de rede) volta ao estado de antes — só as notas daquele toque, nunca a chegada inteira, porque
 * outros toques podem estar em voo. A leitura de verdade só vem quando nenhum toque está pendente.
 */
export function useSeparationTouchMutation({
  arrivalId,
  onFailure,
  onResult,
}: SeparationTouchParams) {
  const queryClient = useQueryClient()
  const detailKey = cargoArrivalDetailQueryKey(arrivalId)
  const mutationKey = [...detailKey, 'touch'] as const

  function patchDetail(states: DocumentStates): void {
    queryClient.setQueryData<CargoArrivalDetail>(detailKey, (current) =>
      current === undefined ? current : applyDocumentStates({ detail: current, states }),
    )
  }

  return useMutation<TouchRun, Error, TouchRequest, TouchContext>({
    mutationFn: (request) =>
      runRequest(request, (batch) =>
        getCargoReceivingClient().batchStatus({ arrivalId, ...batch }),
      ),
    mutationKey,
    onError: (error, request, context) => {
      if (context !== undefined) patchDetail(context.previousStates)
      onFailure({
        code: error.message,
        documentIds: listTouchedDocuments(request).map((document) => document.nfeDocumentId),
        request,
      })
    },
    onMutate: async (request): Promise<TouchContext> => {
      await queryClient.cancelQueries({ queryKey: detailKey })
      const current = queryClient.getQueryData<CargoArrivalDetail>(detailKey)
      const documentIds = listTouchedDocuments(request).map((document) => document.nfeDocumentId)
      patchDetail(planRequestStates(request))
      return {
        previousStates:
          current === undefined ? {} : readDocumentStates({ detail: current, documentIds }),
      }
    },
    onSettled: () => {
      if (queryClient.isMutating({ mutationKey }) > 1) return
      void queryClient.invalidateQueries({ queryKey: detailKey })
      void queryClient.invalidateQueries({ queryKey: CARGO_ARRIVALS_LIST_KEY })
    },
    onSuccess: (run, request) => {
      patchDetail(run.states)
      onResult(run, request)
    },
  })
}
