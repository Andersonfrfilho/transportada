/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  resolveRedeliveryProposal,
  REDELIVERY_PROPOSAL_REFUSAL,
  type ResolveRedeliveryProposalInput,
} from '../../src/trips/domain/redelivery-proposal.policy.js'
import { TRIP_TRANSITION_BLOCK } from '../../src/trips/domain/trip-state.policy.js'

function baseInput(
  overrides: Partial<ResolveRedeliveryProposalInput>,
): ResolveRedeliveryProposalInput {
  return {
    currentStopIds: ['stop-1'],
    documentReleased: false,
    otherLiveDocumentsAtStop: 0,
    stopId: 'stop-1',
    tripStatus: 'route_planned',
    ...overrides,
  }
}

describe('redelivery-proposal.policy', () => {
  test('viagem despachada recusa com o motivo do próprio domínio de trips (D9)', () => {
    const result = resolveRedeliveryProposal(baseInput({ tripStatus: 'dispatched' }))
    expect(result).toEqual({ kind: 'refused', reason: TRIP_TRANSITION_BLOCK.tripAlreadyDispatched })
  })

  test('viagem cancelada recusa', () => {
    const result = resolveRedeliveryProposal(baseInput({ tripStatus: 'cancelled' }))
    expect(result).toEqual({ kind: 'refused', reason: TRIP_TRANSITION_BLOCK.tripCancelled })
  })

  test('parada com uma nota só propõe reordenar para o fim, com a ordem completa', () => {
    const result = resolveRedeliveryProposal(
      baseInput({
        currentStopIds: ['stop-2', 'stop-1'],
        otherLiveDocumentsAtStop: 0,
        stopId: 'stop-1',
      }),
    )
    expect(result).toEqual({
      kind: 'reorder_stop',
      orderedStopIds: ['stop-2', 'stop-1'],
      stopId: 'stop-1',
    })
  })

  test('parada com outras notas vivas propõe liberar a nota', () => {
    const result = resolveRedeliveryProposal(baseInput({ otherLiveDocumentsAtStop: 2 }))
    expect(result).toEqual({ kind: 'release_document', stopId: 'stop-1' })
  })

  test('nota já liberada recusa com motivo próprio', () => {
    const result = resolveRedeliveryProposal(baseInput({ documentReleased: true }))
    expect(result).toEqual({
      kind: 'refused',
      reason: REDELIVERY_PROPOSAL_REFUSAL.documentAlreadyReleased,
    })
  })

  test('nota sem parada (stop_id null) recusa com motivo próprio', () => {
    const result = resolveRedeliveryProposal(baseInput({ stopId: null }))
    expect(result).toEqual({
      kind: 'refused',
      reason: REDELIVERY_PROPOSAL_REFUSAL.documentHasNoStop,
    })
  })
})
