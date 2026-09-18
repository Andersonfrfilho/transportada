/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'

import {
  invalidateMutationEffect,
  MUTATION_EFFECT,
} from '@/modules/shared/mutationInvalidation.service'

import { loadAvailableTripDocuments } from '../shared/availableTripDocuments.service'
import { TRIP_QUERY_KEY } from '../shared/trip.constant'
import type { MultiVehicleProposal, TripCandidateDocument } from '../shared/trip.types'
import {
  buildAutomaticAssemblyDraft,
  isAutomaticAssemblyDraftEmpty,
  type AutomaticProposalState,
} from '../shared/tripAssemblyDraft.service'
import { isAutomaticAssemblyDraft } from '../shared/tripAssemblyDraft.validation'
import {
  DRAFT_DOCUMENTS_UNREACHABLE,
  restoreAutomaticAssemblyDraft,
} from '../shared/tripAssemblyDraftRestore.service'
import {
  TRIP_ASSEMBLY_DRAFT_MODE,
  type TripAssemblyDraftScope,
} from '../shared/tripAssemblyDraftStorage.service'
import {
  EMPTY_DRAFT_NOTICE,
  restoreSuggestion,
  type RetainedSuggestion,
  type RouteAssemblyDraftNotice,
  type SuggestionRestoration,
} from '../shared/tripAssemblySuggestionRestore.service'
import type { TripRouteAssemblyDraft } from '../shared/tripRouteAssembly.service'
import { useTripAssemblyDraftLifecycle } from './useTripAssemblyDraftLifecycle.hook'
import { getTripClient } from './useTripWorkspace.hook'

export const ROUTE_ASSEMBLY_DOCUMENTS_QUERY_KEY = [
  TRIP_QUERY_KEY,
  'route-assembly',
  'documents',
] as const

const SUGGESTION_READERS = {
  readProposal: (suggestionId: string) =>
    getTripClient().readMultiVehicleProposal({ suggestionId }),
  readSuggestionStatus: async (suggestionId: string) =>
    (await getTripClient().readMultiVehicleSuggestion({ suggestionId })).status,
}

type RestoredForm = Readonly<{
  documents: readonly TripCandidateDocument[]
  draft: TripRouteAssemblyDraft
  isOpen: boolean
}>

type RouteAssemblyDraftInput = Readonly<{
  /** O pedido como está na tela — é ele que vira rascunho. */
  form: Readonly<{
    draft: TripRouteAssemblyDraft
    isOpen: boolean
    pendingSuggestionId: null | string
    pool: readonly TripCandidateDocument[]
    proposalState: AutomaticProposalState | null
  }>
  onApplyForm: (form: RestoredForm) => void
  onApplyProposal: (proposal: MultiVehicleProposal, state: AutomaticProposalState) => void
  onReset: () => void
  /** A sugestão ainda calculando: a espera recomeça, e nenhuma sugestão nova é pedida. */
  onResume: (suggestionId: string) => void
  scope: TripAssemblyDraftScope | undefined
  selectableDriverIds: readonly string[]
  selectableVehicleIds: readonly string[]
}>

/**
 * O rascunho da montagem automática: o pedido, a proposta em revisão e a sugestão ainda calculando.
 * ⚠️ A proposta é **relida** na volta, e a sugestão pendente é **esperada de novo** — pedir outra
 * rodaria o roteirizador duas vezes para as mesmas notas.
 */
export function useRouteAssemblyDraft(input: RouteAssemblyDraftInput) {
  const queryClient = useQueryClient()
  const [notice, setNotice] = useState<RouteAssemblyDraftNotice>(EMPTY_DRAFT_NOTICE)
  /** O que a volta não conseguiu reler por falta de rede — guardado para "Tentar novamente". */
  const [retained, setRetained] = useState<null | RetainedSuggestion>(null)
  /** A resposta de um "Tentar novamente" só vale se a proposta guardada ainda for a mesma. */
  const retainedRef = useRef(retained)
  retainedRef.current = retained
  const { form } = input

  function applySuggestion(
    restoration: SuggestionRestoration<MultiVehicleProposal>,
  ): Pick<RouteAssemblyDraftNotice, 'droppedVehicleCount' | 'isProposalDropped'> {
    setRetained(restoration.kind === 'unreachable' ? restoration.retained : null)
    if (restoration.kind === 'restored') {
      input.onApplyProposal(restoration.proposal, restoration.state)
    }
    if (restoration.kind === 'resume') input.onResume(restoration.suggestionId)
    return {
      droppedVehicleCount: restoration.kind === 'restored' ? restoration.droppedVehicleCount : 0,
      isProposalDropped: restoration.kind === 'dropped',
    }
  }

  function reset(): void {
    setNotice(EMPTY_DRAFT_NOTICE)
    setRetained(null)
    input.onReset()
  }

  const built = buildAutomaticAssemblyDraft({
    draft: form.draft,
    isOpen: form.isOpen,
    pendingSuggestionId: form.pendingSuggestionId ?? retained?.pendingSuggestionId ?? null,
    pool: form.pool,
    proposal: form.proposalState,
  })
  /** A proposta sem rede continua no rascunho até alguém conseguir relê-la ou descartá-la. */
  const draft =
    built.proposal === null && retained !== null ? { ...built, proposal: retained.proposal } : built

  const lifecycle = useTripAssemblyDraftLifecycle({
    draft,
    isDraft: isAutomaticAssemblyDraft,
    isEmpty: isAutomaticAssemblyDraftEmpty,
    mode: TRIP_ASSEMBLY_DRAFT_MODE.automatic,
    reset,
    restore: async (stored) => {
      const restored = await restoreAutomaticAssemblyDraft({
        ...SUGGESTION_READERS,
        draft: stored,
        loadDocuments: () =>
          queryClient.fetchQuery({
            queryFn: loadAvailableTripDocuments,
            queryKey: ROUTE_ASSEMBLY_DOCUMENTS_QUERY_KEY,
          }),
        selectableDriverIds: input.selectableDriverIds,
        selectableVehicleIds: input.selectableVehicleIds,
      })
      if (restored === DRAFT_DOCUMENTS_UNREACHABLE) return DRAFT_DOCUMENTS_UNREACHABLE
      return () => {
        /** A medida que o operador foi gravar muda a planta e a conta: nada do cache vale mais. */
        void invalidateMutationEffect({
          effect: MUTATION_EFFECT.packageBoxMeasurement,
          queryClient,
        })
        input.onApplyForm({
          documents: restored.documents,
          draft: { driverIds: restored.driverIds, vehicleIds: restored.vehicleIds },
          isOpen: restored.isOpen,
        })
        const suggestionNotice = applySuggestion(restored.suggestion)
        setNotice({ ...suggestionNotice, droppedDocumentCount: restored.droppedDocumentCount })
      }
    },
    scope: input.scope,
  })

  const retryMutation = useMutation({
    mutationFn: (toRetry: RetainedSuggestion) =>
      restoreSuggestion({
        ...SUGGESTION_READERS,
        documents: form.pool,
        retained: toRetry,
        selectableVehicleIds: input.selectableVehicleIds,
      }),
    onSuccess: (restoration, toRetry) => {
      if (retainedRef.current !== toRetry) return
      const suggestionNotice = applySuggestion(restoration)
      setNotice((current) => ({ ...current, ...suggestionNotice }))
    },
  })

  return {
    clear: () => {
      setNotice(EMPTY_DRAFT_NOTICE)
      setRetained(null)
      lifecycle.clear()
    },
    /** O aviso da volta sai quando o diálogo fecha ou o operador mexe no pedido. */
    dismissNotice: () => setNotice(EMPTY_DRAFT_NOTICE),
    hasDraft: !isAutomaticAssemblyDraftEmpty(draft),
    isDocumentsUnreachable: lifecycle.isUnreachable,
    isRestoring: lifecycle.isRestoring,
    isRetrying: retryMutation.isPending,
    isUnreachable: retained !== null,
    isUnsaved: lifecycle.isUnsaved,
    markTouched: lifecycle.markTouched,
    notice,
    /** As sugestões do rascunho que a volta ainda não aplicou: apagá-lo sem recusá-las as deixa órfãs. */
    readUnrestoredSuggestionIds: (): readonly string[] => {
      const stored = lifecycle.readUnrestored()
      if (stored === undefined) return []
      return [stored.pendingSuggestionId, stored.proposal?.suggestionId].filter(
        (suggestionId): suggestionId is string => typeof suggestionId === 'string',
      )
    },
    /** Uma nova proposta substitui a que não pôde ser relida. */
    releaseRetained: () => setRetained(null),
    retainedSuggestionId: retained?.proposal?.suggestionId,
    retry: () => {
      if (retained !== null) retryMutation.mutate(retained)
    },
    /** Reler as notas do rascunho quando a busca falhou na volta. */
    retryDocuments: lifecycle.retry,
  }
}
