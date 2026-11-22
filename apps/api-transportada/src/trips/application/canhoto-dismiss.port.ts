/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 T5d: as fronteiras de "Descartar" o alerta de canhoto de outra nota.
 */
import type { CanhotoMismatch } from '../domain/canhoto-mismatch.policy.js'
import type { LockedCanhotoMoveSource } from './canhoto-move.port.js'

export type CanhotoDismissAuditEntry = Readonly<{
  action: string
  actorUserId: string
  companyId: string
  correlationId: string
  documentId: string
  ipAddress: string
  permission: string
  proofId: string
  tripId: string
}>

export type CanhotoDismissTransaction = {
  readonly deriveMismatch: (params: {
    readonly companyId: string
    readonly source: LockedCanhotoMoveSource
    readonly tripId: string
  }) => Promise<CanhotoMismatch | null>
  readonly insertAudit: (entry: CanhotoDismissAuditEntry) => Promise<void>
  /** ⚠️ Trava por `companyId` + ids. `null` é 404, nunca 403. */
  readonly lockSourceProof: (params: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }) => Promise<LockedCanhotoMoveSource | null>
  readonly markDismissed: (params: {
    readonly at: Date
    readonly companyId: string
    readonly proofId: string
  }) => Promise<void>
}

export type CanhotoDismissUnitOfWork = {
  readonly execute: <TResult>(
    run: (transaction: CanhotoDismissTransaction) => Promise<TResult>,
  ) => Promise<TResult>
}

export type DismissCanhotoMismatchCommand = {
  readonly actorUserId: string
  readonly companyId: string
  readonly correlationId: string
  readonly documentId: string
  readonly ipAddress: string
  readonly tripId: string
}

export type CanhotoDismissResult = Readonly<{
  /** `true` quando o alerta já estava descartado: nada foi escrito de novo. */
  alreadyDismissed: boolean
  documentId: string
}>

export type CanhotoDismissPort = {
  readonly dismiss: (command: DismissCanhotoMismatchCommand) => Promise<CanhotoDismissResult>
}
