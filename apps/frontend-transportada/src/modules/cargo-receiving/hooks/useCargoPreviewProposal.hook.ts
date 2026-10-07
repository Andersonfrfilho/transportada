/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo } from 'react'

import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import { useProposeCargoPreviewArrivalMutation } from '../mutations/useProposeCargoPreviewArrival.mutation'
import type { CargoPreviewArrivalProposal, CargoPreviewItem } from '../shared/cargoPreview.types'
import {
  buildCargoArrivalPrefill,
  describeCargoPreviewProposal,
  navigateToPrefilledCargoArrival,
  type CargoPreviewProposalView,
} from '../shared/cargoPreviewProposal.service'

export type CargoPreviewProposalController = Readonly<{
  errorCode: string | undefined
  isPending: boolean
  propose: () => void
  proposal: CargoPreviewArrivalProposal | undefined
  register: () => void
  view: CargoPreviewProposalView | undefined
}>

/**
 * Propor não cria nada: mostra o rascunho. Registrar leva à tela de registro com contratante e notas
 * preenchidos e SEM data nem hora — a hora em que o caminhão chegou é do operador (RF5b).
 */
export function useCargoPreviewProposal(
  input: Readonly<{ items: readonly CargoPreviewItem[]; previewId: string }>,
): CargoPreviewProposalController {
  const mutation = useProposeCargoPreviewArrivalMutation(input.previewId)
  const navigator = useMemo(createBrowserWorkspaceNavigator, [])
  const proposal = mutation.data

  const view = useMemo(() => {
    if (proposal === undefined) return undefined
    const numbersByDocumentId = new Map(
      input.items.flatMap((item) =>
        item.document === null ? [] : [[item.document.id, item.document.number] as const],
      ),
    )
    return describeCargoPreviewProposal({ numbersByDocumentId, proposal })
  }, [input.items, proposal])

  return {
    errorCode: mutation.error instanceof Error ? mutation.error.message : undefined,
    isPending: mutation.isPending,
    propose: () => mutation.mutate(),
    proposal,
    register: () => {
      if (proposal === undefined) return
      navigateToPrefilledCargoArrival({ navigator, prefill: buildCargoArrivalPrefill(proposal) })
    },
    view,
  }
}
