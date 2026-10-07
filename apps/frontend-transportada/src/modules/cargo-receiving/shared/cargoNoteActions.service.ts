/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CargoArrivalStatus, CargoDocumentState } from './cargoArrival.types'
import { CARGO_DECIDED_CASE_STATUSES } from './cargoOccurrence.constant'
import type { CargoOccurrenceView, CargoReturnState } from './cargoOccurrence.types'

export type CargoNoteBadge = 'none' | 'occurrenceOpen' | 'returned' | 'toReturn'

export type CargoNoteContext = Readonly<{
  arrivalStatus: CargoArrivalStatus
  /** `trip.manage`: abre a avaria, marca e conclui. */
  canManage: boolean
  /** `occurrences.resolve`: só quem decide a tratativa desfaz a devolução (ADR-0094 §9.5, ajuste 8). */
  canResolve: boolean
  document: Readonly<{ isInLiveTrip: boolean; separationState: CargoDocumentState }>
  now: number
  /** Todas as ocorrências de recebimento DESTA nota. */
  occurrences: readonly CargoOccurrenceView[]
  returnOccurrenceId: string | null
  returnState: CargoReturnState
  separationDueAt: string | null
}>

export type CargoNoteActions = Readonly<{
  badge: CargoNoteBadge
  canComplete: boolean
  canMark: boolean
  canOpenOccurrence: boolean
  canUnmark: boolean
  /** A nota está marcada e a tratativa da origem ainda não foi decidida: a tela diz que espera. */
  isAwaitingDecision: boolean
  /** A nota está marcada, mas a tratativa da origem foi cancelada: não há decisão a esperar, só desfazer a devolução. */
  isReturnCaseCancelled: boolean
  /** Dentro das regras de abrir, mas o prazo acabou: a tela explica em vez de oferecer o botão. */
  isWindowClosed: boolean
  /** As avarias vivas da nota (nem a ocorrência nem a tratativa canceladas): as origens que "devolver ao contratante" pode escolher. */
  markableOccurrences: readonly CargoOccurrenceView[]
}>

/** Vale até o instante limite; sem janela (perfil sem regra) vale enquanto a chegada estiver aberta. */
export function isOccurrenceWindowOpen(
  input: Readonly<{ now: number; separationDueAt: string | null }>,
): boolean {
  if (input.separationDueAt === null) return true
  return input.now <= Date.parse(input.separationDueAt)
}

function resolveBadge(
  input: Readonly<{ hasLiveOccurrence: boolean; returnState: CargoReturnState }>,
): CargoNoteBadge {
  if (input.returnState === 'marked') return 'toReturn'
  if (input.returnState === 'returned') return 'returned'
  return input.hasLiveOccurrence ? 'occurrenceOpen' : 'none'
}

function isOriginCancelled(origin: CargoOccurrenceView): boolean {
  return origin.cancelledAt !== null || origin.case?.status === 'cancelled'
}

/** Sem tratativa (`null`) a API recusa concluir (`CARGO_ARRIVAL_RETURN_DECISION_PENDING`, T3.4a): nunca está "decidida". */
function isCaseDecided(origin: CargoOccurrenceView): boolean {
  return origin.case !== null && CARGO_DECIDED_CASE_STATUSES.includes(origin.case.status)
}

/**
 * O que cada papel enxerga em cada nota, espelhando as políticas da API (`cargo-arrival-occurrence.policy.ts` e
 * `cargo-arrival-return.policy.ts`): a janela vale só para ABRIR; marcar, desfazer e concluir dependem da
 * decisão do contratante, que costuma passar do prazo. A nota devolvida é terminal.
 */
export function resolveCargoNoteActions(context: CargoNoteContext): CargoNoteActions {
  const { document, returnState } = context
  const markableOccurrences = context.occurrences.filter((item) => !isOriginCancelled(item))
  const isOpen = context.arrivalStatus === 'open'
  const isEditable = isOpen && returnState !== 'returned'
  const canWrite = context.canManage && isEditable
  const isReceived = document.separationState !== 'expected'
  const isWindowOpen = isOccurrenceWindowOpen(context)
  const origin = context.occurrences.find((item) => item.id === context.returnOccurrenceId)
  const isMarked = returnState === 'marked'
  const isOriginLive = origin !== undefined && !isOriginCancelled(origin)

  return {
    badge: resolveBadge({ hasLiveOccurrence: markableOccurrences.length > 0, returnState }),
    canComplete: canWrite && isMarked && isOriginLive && isCaseDecided(origin),
    canMark:
      canWrite &&
      returnState === 'none' &&
      markableOccurrences.length > 0 &&
      !document.isInLiveTrip,
    canOpenOccurrence: canWrite && isReceived && isWindowOpen,
    canUnmark: context.canResolve && isOpen && isMarked,
    isAwaitingDecision: canWrite && isMarked && isOriginLive && !isCaseDecided(origin),
    isReturnCaseCancelled: canWrite && isMarked && origin !== undefined && !isOriginLive,
    isWindowClosed: canWrite && isReceived && !isWindowOpen,
    markableOccurrences,
  }
}

export type CloseBlocker = Readonly<{ documentId: string; number: string }>

/** O que segura "Fechar chegada" antes de qualquer clique: a nota marcada espera o contratante (fechada, ficaria presa). */
export function listCloseBlockers(
  input: Readonly<{
    documents: readonly Readonly<{ nfeDocumentId: string; number: string }>[]
    returns: ReadonlyMap<string, Readonly<{ returnToContractor: CargoReturnState }>>
  }>,
): readonly CloseBlocker[] {
  return input.documents
    .filter(
      (document) => input.returns.get(document.nfeDocumentId)?.returnToContractor === 'marked',
    )
    .map((document) => ({ documentId: document.nfeDocumentId, number: document.number }))
}
