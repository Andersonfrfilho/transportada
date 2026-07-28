/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import type {
  MdfeIssuanceEvent,
  MdfeIssuanceOutboxEventType,
  MdfeManifestStatus,
} from '../../database/mdfe.schema.js'
import { MdfeIdempotencyKeyReusedError } from '../domain/mdfe-issuance.error.js'
import type {
  MdfeIssuanceAttemptRecord,
  MdfeIssuanceState,
  MdfeIssuanceTransactionPort,
} from './mdfe-issuance.port.js'

export type MdfeIssuanceSummary = {
  readonly attemptId: string
  readonly attemptKind: MdfeIssuanceAttemptRecord['attemptKind']
  readonly manifestId: string
  readonly manifestStatus: MdfeManifestStatus
  readonly replayed: boolean
  readonly requestedAt: string
}

export const MDFE_ISSUANCE_EVENT_NAME = {
  cancel: 'cancel_requested',
  close: 'close_requested',
  issue: 'issue_requested',
} as const satisfies Readonly<Record<string, MdfeIssuanceEvent>>

export const MDFE_ISSUANCE_OUTBOX_EVENT = {
  cancel: 'transportada.mdfe.manifest.cancel.requested',
  close: 'transportada.mdfe.manifest.close.requested',
  issue: 'transportada.mdfe.manifest.issue.requested',
} as const satisfies Readonly<Record<string, MdfeIssuanceOutboxEventType>>

/** A digital do pedido separa uma repetição de rede de um pedido novo com a mesma chave. */
export function createRequestFingerprint(request: Readonly<Record<string, unknown>>): string {
  const canonical = Object.keys(request)
    .sort()
    .map((key) => [key, request[key]])
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

export async function findReplaySummary(params: {
  readonly idempotencyKey: string
  readonly manifestStatus: MdfeManifestStatus
  readonly requestFingerprint: string
  readonly transaction: MdfeIssuanceTransactionPort
}): Promise<MdfeIssuanceSummary | null> {
  const attempt = await params.transaction.findAttemptByIdempotencyKey({
    idempotencyKey: params.idempotencyKey,
  })
  if (attempt === null) return null
  if (attempt.requestFingerprint !== params.requestFingerprint) {
    throw new MdfeIdempotencyKeyReusedError()
  }

  return {
    attemptId: attempt.attemptId,
    attemptKind: attempt.attemptKind,
    manifestId: attempt.manifestId,
    manifestStatus: params.manifestStatus,
    replayed: true,
    requestedAt: attempt.createdAt,
  }
}

export type ScheduleAttemptParams = {
  readonly attempt: MdfeIssuanceAttemptRecord
  readonly correlationId: string
  readonly manifestStatus: MdfeManifestStatus
  readonly occurredAt: string
  readonly state: MdfeIssuanceState
  readonly transaction: MdfeIssuanceTransactionPort
  readonly userId: string
}

/** A SEFAZ nunca é chamada aqui: o request só deixa o pedido no outbox para o worker executar. */
export async function scheduleAttempt(params: ScheduleAttemptParams): Promise<MdfeIssuanceSummary> {
  const { attempt, state, transaction } = params
  const attemptKind = attempt.attemptKind

  await transaction.appendEvent({
    attemptId: attempt.attemptId,
    eventName: MDFE_ISSUANCE_EVENT_NAME[attemptKind],
    manifestId: attempt.manifestId,
    occurredAt: params.occurredAt,
    payload: { attemptKind, fiscalEnvironment: state.fiscalEnvironment },
  })
  await transaction.pushOutbox({
    actorUserId: params.userId,
    attemptFingerprint: attempt.requestFingerprint,
    attemptId: attempt.attemptId,
    attemptKind,
    correlationId: params.correlationId,
    eventType: MDFE_ISSUANCE_OUTBOX_EVENT[attemptKind],
    manifestId: attempt.manifestId,
    payload: { attemptKind, manifestId: attempt.manifestId },
  })

  return {
    attemptId: attempt.attemptId,
    attemptKind,
    manifestId: attempt.manifestId,
    manifestStatus: params.manifestStatus,
    replayed: false,
    requestedAt: params.occurredAt,
  }
}
