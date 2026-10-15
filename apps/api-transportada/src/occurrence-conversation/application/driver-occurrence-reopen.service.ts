/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 / ADR-0105 §3 (emenda à 183 D4 e à 263 D4): a resposta do motorista com `reopen` reabre o andamento
 * da ocorrência. A linha é travada antes de ler o estado, dentro da transação da mensagem: resolver × reabrir
 * serializa, e a reabertura sem o que reabrir é 409 sem gravar nada.
 */
import { OccurrenceNotResolvedError } from '../../trips/domain/occurrence-resolution.error.js'
import { resolveOccurrenceResolutionState } from '../../trips/domain/occurrence-resolution.policy.js'
import {
  OccurrenceCancelledError,
  TripOccurrenceNotFoundError,
} from '../../trips/domain/trip.error.js'
import type {
  DriverConversationTransactionPort,
  DriverOccurrenceReopenTarget,
} from './driver-conversation.port.js'

type ReopenPorts = Pick<
  DriverConversationTransactionPort,
  'insertDriverReopenedEvent' | 'lockOccurrenceResolution'
>

/** Antes da mensagem: trava e confere que há o que reabrir. */
export async function assertOccurrenceReopenable(
  transaction: ReopenPorts,
  target: DriverOccurrenceReopenTarget,
): Promise<void> {
  const snapshot = await transaction.lockOccurrenceResolution(target)
  if (snapshot === undefined) throw new TripOccurrenceNotFoundError()
  const current = resolveOccurrenceResolutionState(snapshot)
  if (current.state === 'cancelled') throw new OccurrenceCancelledError()
  if (current.state !== 'resolved') throw new OccurrenceNotResolvedError()
}

/** Depois da mensagem, na mesma transação. */
export async function recordOccurrenceReopened(
  transaction: ReopenPorts,
  input: DriverOccurrenceReopenTarget & {
    readonly conversationMessageId: string
    readonly driverUserId: string
  },
): Promise<void> {
  await transaction.insertDriverReopenedEvent(input)
}
