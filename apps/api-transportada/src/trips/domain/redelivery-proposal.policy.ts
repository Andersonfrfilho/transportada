/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 164 T14a (RF17, D9): a proposta de reentrega — pura, sem I/O. `checkTripAcceptsLinkage`
 * (`trip-state.policy.ts`) é a mesma porta de não-retorno de vincular, desvincular e reordenar
 * (ADR-0043 §2/§3) — reaproveitada aqui em vez de uma cópia.
 *
 * A parada é que se reordena, nunca a nota isolada. Quando a parada da nota carrega só ela, a
 * proposta é mandá-la para o fim (`orderedStopIds`, porque `PATCH /trips/:id/stops/order` recusa
 * lista parcial — `TripStopSetMismatchError`). Quando carrega outras notas vivas, mover a parada
 * arrastaria entregas que não têm nada com a ocorrência: a proposta é liberar a nota
 * (`released_at`, spec 102) e devolvê-la ao pool.
 *
 * Dois casos fora da spec original, achados na validação: nota sem parada (`stop_id is null`, o
 * balde "sem endereço") e nota já liberada — os dois recusam com motivo próprio, nunca inventando
 * uma proposta que não existe.
 */
import type { TripStatus } from '../../database/trip.schema.js'
import { checkTripAcceptsLinkage } from './trip-state.policy.js'
import type { TripTransitionBlock } from './trip-state.policy.js'

export const REDELIVERY_PROPOSAL_REFUSAL = {
  /** A nota já voltou ao pool — não há mais parada para reordenar nem liberar de novo. */
  documentAlreadyReleased: 'DOCUMENT_ALREADY_RELEASED',
  /** O balde "sem endereço": a nota nunca chegou a ter parada nesta viagem. */
  documentHasNoStop: 'DOCUMENT_HAS_NO_STOP',
} as const

export type RedeliveryProposalReason =
  | TripTransitionBlock
  | (typeof REDELIVERY_PROPOSAL_REFUSAL)[keyof typeof REDELIVERY_PROPOSAL_REFUSAL]

export type RedeliveryProposal =
  | {
      readonly kind: 'reorder_stop'
      /** A rota de reordenação recusa lista parcial — a proposta já vem com o conjunto inteiro. */
      readonly orderedStopIds: readonly string[]
      readonly stopId: string
    }
  | { readonly kind: 'release_document'; readonly stopId: string }
  | { readonly kind: 'refused'; readonly reason: RedeliveryProposalReason }

export type ResolveRedeliveryProposalInput = {
  /** Todas as paradas da viagem, na ordem atual — para montar `orderedStopIds`. */
  readonly currentStopIds: readonly string[]
  readonly documentReleased: boolean
  /** Notas vivas (`released_at is null`) na mesma parada, sem contar a própria nota. */
  readonly otherLiveDocumentsAtStop: number
  readonly stopId: string | null
  readonly tripStatus: TripStatus
}

function moveStopToEnd(stopIds: readonly string[], stopId: string): readonly string[] {
  return [...stopIds.filter((id) => id !== stopId), stopId]
}

export function resolveRedeliveryProposal(
  input: ResolveRedeliveryProposalInput,
): RedeliveryProposal {
  const linkageBlock = checkTripAcceptsLinkage(input.tripStatus)
  if (linkageBlock !== null) return { kind: 'refused', reason: linkageBlock }

  if (input.documentReleased) {
    return { kind: 'refused', reason: REDELIVERY_PROPOSAL_REFUSAL.documentAlreadyReleased }
  }

  if (input.stopId === null) {
    return { kind: 'refused', reason: REDELIVERY_PROPOSAL_REFUSAL.documentHasNoStop }
  }

  if (input.otherLiveDocumentsAtStop > 0) {
    return { kind: 'release_document', stopId: input.stopId }
  }

  return {
    kind: 'reorder_stop',
    orderedStopIds: moveStopToEnd(input.currentStopIds, input.stopId),
    stopId: input.stopId,
  }
}
