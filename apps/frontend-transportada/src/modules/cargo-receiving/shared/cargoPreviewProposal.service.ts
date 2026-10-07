/* Copyright (c) 2026 Ada Technology. MIT License. */
import { hasExactKeys } from '@/modules/shared/objectKeys.service'

import { CARGO_PREVIEW_PREFILL_STATE_KEY } from './cargoPreview.constant'
import type {
  CargoArrivalPrefill,
  CargoPreviewArrivalProposal,
  CargoPreviewStatus,
} from './cargoPreview.types'
import { isNullableString, isStringList } from './cargoPreviewGuards.validation'
import { buildCargoArrivalRegisterRoute } from './cargoReceivingRoute.service'
import type { WorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'
import { CARGO_RECEIVING_WORKSPACE } from './cargoReceiving.constant'

export type ProposalAvailability = 'available' | 'no-matched' | 'not-ready'

/** A prévia só propõe depois de lida, e só há o que propor com ao menos uma nota vinculada. */
export function resolveProposalAvailability(
  input: Readonly<{ matchedCount: number; status: CargoPreviewStatus }>,
): ProposalAvailability {
  if (input.status !== 'ready') return 'not-ready'
  return input.matchedCount > 0 ? 'available' : 'no-matched'
}

export type RefusedProposalDocument = Readonly<{
  documentId: string
  number: string | undefined
  reason: string
}>

export type CargoPreviewProposalView = Readonly<{
  canRegister: boolean
  enteringCount: number
  refused: readonly RefusedProposalDocument[]
}>

/** O número da nota só se sabe das linhas já carregadas: a proposta devolve ids, não NF. */
export function describeCargoPreviewProposal(
  input: Readonly<{
    numbersByDocumentId: ReadonlyMap<string, string>
    proposal: CargoPreviewArrivalProposal
  }>,
): CargoPreviewProposalView {
  const { proposal } = input
  return {
    canRegister: proposal.documentIds.length > 0,
    enteringCount: proposal.documentIds.length,
    refused: proposal.refused.map((entry) => ({
      documentId: entry.documentId,
      number: input.numbersByDocumentId.get(entry.documentId),
      reason: entry.reason,
    })),
  }
}

/**
 * O recado leva contratante, notas, a prévia e o dia planejado — NUNCA data nem hora de chegada: quem
 * confirma a hora em que o caminhão chegou é o operador (RF5b).
 */
export function buildCargoArrivalPrefill(
  proposal: CargoPreviewArrivalProposal,
): CargoArrivalPrefill {
  return {
    contractorId: proposal.contractorId,
    documentIds: proposal.documentIds,
    plannedDate: proposal.plannedDate,
    previewId: proposal.previewId,
  }
}

const PREFILL_KEYS = ['contractorId', 'documentIds', 'plannedDate', 'previewId'] as const

/** O recado vem de `history.state`, que qualquer um pode ter escrito: só vale o formato exato. */
export function readCargoArrivalPrefill(state: unknown): CargoArrivalPrefill | undefined {
  if (typeof state !== 'object' || state === null) return undefined
  const prefill: unknown = (state as Record<string, unknown>)[CARGO_PREVIEW_PREFILL_STATE_KEY]
  if (!hasExactKeys(prefill, PREFILL_KEYS)) return undefined
  if (
    typeof prefill.contractorId !== 'string' ||
    typeof prefill.previewId !== 'string' ||
    !isNullableString(prefill.plannedDate) ||
    !isStringList(prefill.documentIds)
  ) {
    return undefined
  }
  return {
    contractorId: prefill.contractorId,
    documentIds: prefill.documentIds,
    plannedDate: prefill.plannedDate,
    previewId: prefill.previewId,
  }
}

/** Abre o registro da chegada com o recado em `history.state`, que sobrevive a recarregar a página. */
export function navigateToPrefilledCargoArrival(
  input: Readonly<{ navigator: WorkspaceNavigator; prefill: CargoArrivalPrefill }>,
): void {
  input.navigator.pushPath(buildCargoArrivalRegisterRoute())
  window.history.replaceState({ [CARGO_PREVIEW_PREFILL_STATE_KEY]: input.prefill }, '')
  input.navigator.rememberWorkspace(CARGO_RECEIVING_WORKSPACE)
  input.navigator.dispatchPopState()
}
