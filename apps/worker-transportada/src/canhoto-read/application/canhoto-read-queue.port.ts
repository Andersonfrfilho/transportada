/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CanhotoTripDocument } from '../domain/canhoto-barcode.policy.js'

/** `documentId` é `trip_documents.id` da nota sob a qual o comprovante foi gravado. */
export type PendingCanhotoProof = Readonly<{
  bucket: string
  companyId: string
  documentId: string
  mimeType: string
  objectKey: string
  proofId: string
  sizeBytes: number
  tripId: string
}>

export type ListPendingCanhotoProofsParams = Readonly<{
  /** Quem já foi visto neste ciclo: falha de infraestrutura não sai da fila e voltaria no lote seguinte. */
  excludeProofIds: readonly string[]
  limit: number
}>

export type ListTripDocumentsParams = Readonly<{ companyId: string; tripId: string }>

export type MarkCanhotoReadAttemptedParams = Readonly<{
  attemptedAt: Date
  companyId: string
  proofId: string
}>

export type CanhotoReadQueuePort = Readonly<{
  listPending: (params: ListPendingCanhotoProofsParams) => Promise<readonly PendingCanhotoProof[]>
  listTripDocuments: (params: ListTripDocumentsParams) => Promise<readonly CanhotoTripDocument[]>
  /** `false` quando a linha já não estava na fila (outro leitor, ou já lida): nada foi escrito. */
  markAttempted: (params: MarkCanhotoReadAttemptedParams) => Promise<boolean>
}>
