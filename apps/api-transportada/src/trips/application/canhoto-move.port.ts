/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 344 D9/RF10: as fronteiras de "mover o canhoto para a NF certa".
 */
import type {
  TripDeliveryProofCanhotoReview,
  TripDeliveryProofCanhotoReviewOrigin,
} from '../../database/trip.schema.js'
import type { CanhotoMismatch } from '../domain/canhoto-mismatch.policy.js'
import type { CanhotoMoveReason, CanhotoMoveTarget } from '../domain/canhoto-move.policy.js'
import type { CanhotoReviewView } from './canhoto-review.port.js'

/** A prova de origem travada, com o que a comparação precisa da nota dela. */
export type LockedCanhotoMoveSource = {
  readonly expectedAccessKey: null | string
  readonly expectedNfeDocumentId: null | string
  readonly expectedNumber: null | string
  readonly expectedSeries: null | string
  /** Spec 344 T5d: o escritório já descartou o alerta desta foto. */
  readonly mismatchDismissed: boolean
  readonly proofId: string
  readonly readNumber: null | string
  readonly readSeries: null | string
  readonly review: TripDeliveryProofCanhotoReview
  readonly reviewOrigin: TripDeliveryProofCanhotoReviewOrigin | null
}

/** Ids e código — nenhum número de nota, série, nome ou texto lido (RNF de PII). */
export type CanhotoMoveAuditEntry = Readonly<{
  action: string
  actorUserId: string
  companyId: string
  correlationId: string
  fromDocumentId: string
  ipAddress: string
  permission: string
  proofId: string
  reason: CanhotoMoveReason
  toDocumentId: string
  tripId: string
}>

export type CanhotoMoveTransaction = {
  readonly deriveMismatch: (params: {
    readonly companyId: string
    readonly source: LockedCanhotoMoveSource
    readonly tripId: string
  }) => Promise<CanhotoMismatch | null>
  /** A foto que a trilha diz já ter sido movida de A para B e que está em B agora (idempotência). */
  readonly findAlreadyMovedProof: (params: {
    readonly companyId: string
    readonly fromDocumentId: string
    readonly toDocumentId: string
    readonly tripId: string
  }) => Promise<null | string>
  readonly findTarget: (params: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }) => Promise<CanhotoMoveTarget | null>
  readonly insertAudit: (entry: CanhotoMoveAuditEntry) => Promise<void>
  /** ⚠️ Trava por `companyId` + ids. `null` é 404, nunca 403. */
  readonly lockSourceProof: (params: {
    readonly companyId: string
    readonly documentId: string
    readonly tripId: string
  }) => Promise<LockedCanhotoMoveSource | null>
  /** Leva a prova ao evento de B como `pending`: veredito zerado, leitura mantida. */
  readonly moveProof: (params: {
    readonly companyId: string
    readonly proofId: string
    readonly targetEventId: string
  }) => Promise<void>
  readonly readReviewView: (params: {
    readonly companyId: string
    readonly proofId: string
  }) => Promise<CanhotoReviewView>
}

export type CanhotoMoveUnitOfWork = {
  readonly execute: <TResult>(
    run: (transaction: CanhotoMoveTransaction) => Promise<TResult>,
  ) => Promise<TResult>
}

export type MoveCanhotoProofCommand = {
  readonly actorUserId: string
  readonly companyId: string
  readonly correlationId: string
  readonly documentId: string
  readonly ipAddress: string
  readonly reason: CanhotoMoveReason
  readonly targetDocumentId: string
  readonly tripId: string
}

export type CanhotoMoveResult = Readonly<{
  /** `true` quando o pedido repetiu um movimento já feito: nada foi escrito de novo. */
  alreadyMoved: boolean
  review: CanhotoReviewView
  sourceDocumentId: string
  targetDocumentId: string
}>

export type CanhotoMovePort = {
  readonly move: (command: MoveCanhotoProofCommand) => Promise<CanhotoMoveResult>
}
