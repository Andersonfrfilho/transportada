/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import type { NfeDocumentListItem } from '@/modules/nfe-workspace/shared/nfeWorkspaceClient.service'
import {
  invalidateMutationEffect,
  MUTATION_EFFECT,
} from '@/modules/shared/mutationInvalidation.service'

import { loadAvailableTripDocuments } from '../shared/availableTripDocuments.service'
import type { RouteChoice } from '../shared/routeGeometry.service'
import { TRIP_QUERY_KEY } from '../shared/trip.constant'
import {
  buildManualAssemblyDraft,
  isManualAssemblyDraftEmpty,
} from '../shared/tripAssemblyDraft.service'
import { isManualAssemblyDraft } from '../shared/tripAssemblyDraft.validation'
import {
  DRAFT_DOCUMENTS_UNREACHABLE,
  restoreManualAssemblyDraft,
  type ManualAssemblyRestoration,
} from '../shared/tripAssemblyDraftRestore.service'
import {
  TRIP_ASSEMBLY_DRAFT_MODE,
  type TripAssemblyDraftScope,
} from '../shared/tripAssemblyDraftStorage.service'
import type { TripQuickCreateQueue } from '../shared/tripQuickCreate.service'
import { useTripAssemblyDraftLifecycle } from './useTripAssemblyDraftLifecycle.hook'

export const QUICK_CREATE_DOCUMENTS_QUERY_KEY = [
  TRIP_QUERY_KEY,
  'quick-create',
  'documents',
] as const

type QuickCreateDraftInput = Readonly<{
  /** A montagem como está na tela — é ela que vira rascunho. */
  form: Readonly<{
    cityOrder: readonly string[]
    dailyAllowanceDaysInput: string | undefined
    driverIds: readonly string[]
    isOpen: boolean
    queue: TripQuickCreateQueue
    routeChoice: RouteChoice | undefined
    vehicleId: string
  }>
  onApply: (restored: ManualAssemblyRestoration<NfeDocumentListItem>) => void
  onReset: () => void
  scope: TripAssemblyDraftScope | undefined
  selectableDriverIds: readonly string[]
  selectableVehicleIds: readonly string[]
}>

/**
 * O rascunho da montagem manual. A volta à tela reconstrói a montagem de onde o operador saiu —
 * medir as caixas desmonta esta página —, e a ordem das paradas volta pelas notas relidas: o
 * rascunho não guarda endereço.
 */
export function useQuickCreateDraft(input: QuickCreateDraftInput) {
  const queryClient = useQueryClient()
  /** Quantas notas do rascunho não voltaram — viraram viagem enquanto o operador estava fora. */
  const [droppedDocumentCount, setDroppedDocumentCount] = useState(0)

  const draft = buildManualAssemblyDraft(input.form)
  const lifecycle = useTripAssemblyDraftLifecycle({
    draft,
    isDraft: isManualAssemblyDraft,
    isEmpty: isManualAssemblyDraftEmpty,
    mode: TRIP_ASSEMBLY_DRAFT_MODE.manual,
    reset: () => {
      setDroppedDocumentCount(0)
      input.onReset()
    },
    restore: async (draft) => {
      const restored = await restoreManualAssemblyDraft({
        draft,
        loadDocuments: () =>
          queryClient.fetchQuery({
            queryFn: loadAvailableTripDocuments,
            queryKey: QUICK_CREATE_DOCUMENTS_QUERY_KEY,
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
        setDroppedDocumentCount(restored.droppedDocumentCount)
        input.onApply(restored)
      }
    },
    scope: input.scope,
  })

  return {
    clear: () => {
      setDroppedDocumentCount(0)
      lifecycle.clear()
    },
    /** O aviso da volta sai quando o diálogo fecha ou a fila muda. */
    dismissNotice: () => setDroppedDocumentCount(0),
    droppedDocumentCount,
    /** A mesma regra que decide gravar: diária digitada também é rascunho. */
    hasDraft: !isManualAssemblyDraftEmpty(draft),
    isRestoring: lifecycle.isRestoring,
    isUnreachable: lifecycle.isUnreachable,
    isUnsaved: lifecycle.isUnsaved,
    markTouched: lifecycle.markTouched,
    retry: lifecycle.retry,
  }
}
