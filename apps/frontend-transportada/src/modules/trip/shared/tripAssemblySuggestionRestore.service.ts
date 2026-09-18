/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * A proposta guardada no rascunho mora no servidor. Ela é relida (`ready`), nunca recalculada: rodar
 * o roteirizador de novo na volta criaria outra sugestão para as mesmas notas. E falha de rede não é
 * veredito: a proposta fica guardada para outra tentativa, em vez de sumir calada.
 */
import type { RouteSuggestionStatus } from '@/modules/routing/shared/routeSuggestion.types'

import type { AutomaticProposalState } from './tripAssemblyDraft.service'
import type { AutomaticProposalDraft } from './tripAssemblyDraft.validation'
import { decodeStopOrderByVehicle, type StopOrderDocument } from './tripAssemblyStopOrder.service'

/** O que a volta não conseguiu decidir por falta de rede — fica guardado para outra tentativa. */
export type RetainedSuggestion = Readonly<{
  pendingSuggestionId: null | string
  proposal: AutomaticProposalDraft | null
}>

/** O que não voltou do rascunho — a tela diz, em vez de o operador descobrir pela contagem. */
export type RouteAssemblyDraftNotice = Readonly<{
  droppedDocumentCount: number
  droppedVehicleCount: number
  isProposalDropped: boolean
}>

export const EMPTY_DRAFT_NOTICE: RouteAssemblyDraftNotice = {
  droppedDocumentCount: 0,
  droppedVehicleCount: 0,
  isProposalDropped: false,
}

export type SuggestionRestoration<TProposal> =
  | Readonly<{ kind: 'dropped' }>
  | Readonly<{ kind: 'none' }>
  | Readonly<{ kind: 'resume'; suggestionId: string }>
  | Readonly<{ kind: 'unreachable'; retained: RetainedSuggestion }>
  | Readonly<{
      droppedVehicleCount: number
      kind: 'restored'
      proposal: TProposal
      state: AutomaticProposalState
    }>

export type SuggestionReaders<TProposal> = Readonly<{
  readProposal: (suggestionId: string) => Promise<TProposal>
  readSuggestionStatus: (suggestionId: string) => Promise<RouteSuggestionStatus>
}>

/** A sugestão pedida que ainda roda no worker: a espera recomeça de onde parou. */
const AWAITABLE_STATUSES: ReadonlySet<RouteSuggestionStatus> = new Set([
  'queued',
  'ready',
  'running',
])
const READY_STATUS: RouteSuggestionStatus = 'ready'

export function keepSelectable(
  ids: readonly string[],
  selectable: readonly string[],
): readonly string[] {
  const allowed = new Set(selectable)
  return ids.filter((id) => allowed.has(id))
}

function decodeProposalState(
  input: Readonly<{
    documents: readonly StopOrderDocument[]
    proposal: AutomaticProposalDraft
    selectableVehicleIds: readonly string[]
  }>,
): AutomaticProposalState {
  const { documents, proposal } = input
  return {
    draftOrderByVehicle: decodeStopOrderByVehicle({
      documents,
      orders: proposal.draftOrderDocumentIdsByVehicle,
    }),
    draftStopMoves: new Map(proposal.draftStopMoves),
    openVehicleId: proposal.openVehicleId,
    orderByVehicle: decodeStopOrderByVehicle({
      documents,
      orders: proposal.orderDocumentIdsByVehicle,
    }),
    pendingRemovals: new Set(proposal.pendingRemovals),
    releaseLayoutByVehicle: new Map(proposal.releaseLayoutByVehicle),
    routeChoiceByVehicle: new Map(proposal.routeChoiceByVehicle),
    selectedVehicleIds: new Set(
      keepSelectable(proposal.selectedVehicleIds, input.selectableVehicleIds),
    ),
    stopMoves: new Map(proposal.stopMoves),
    suggestionId: proposal.suggestionId,
  }
}

/**
 * `stale`, `failed`, `accepted` e `rejected` descrevem uma proposta que não se aceita mais — ela
 * sai, o pedido fica. A sugestão ainda pendente que está na fila, rodando ou pronta é **esperada de
 * novo**. Leitura que falha não decide nada: o que estava guardado continua guardado.
 */
export async function restoreSuggestion<TProposal>(
  input: SuggestionReaders<TProposal> &
    Readonly<{
      documents: readonly StopOrderDocument[]
      retained: RetainedSuggestion
      selectableVehicleIds: readonly string[]
    }>,
): Promise<SuggestionRestoration<TProposal>> {
  const { pendingSuggestionId, proposal } = input.retained
  try {
    if (proposal !== null) {
      const status = await input.readSuggestionStatus(proposal.suggestionId)
      if (status !== READY_STATUS) return { kind: 'dropped' }
      const state = decodeProposalState({ ...input, proposal })
      return {
        droppedVehicleCount: proposal.selectedVehicleIds.length - state.selectedVehicleIds.size,
        kind: 'restored',
        proposal: await input.readProposal(proposal.suggestionId),
        state,
      }
    }
    if (pendingSuggestionId === null) return { kind: 'none' }
    const status = await input.readSuggestionStatus(pendingSuggestionId)
    return AWAITABLE_STATUSES.has(status)
      ? { kind: 'resume', suggestionId: pendingSuggestionId }
      : { kind: 'dropped' }
  } catch {
    return { kind: 'unreachable', retained: input.retained }
  }
}
