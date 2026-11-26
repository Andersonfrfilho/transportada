/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { PendingCanhotoProof } from './canhoto-read-queue.port.js'

/**
 * Spec 344 D7: a fila da passada OCR. `documentNumber` é o `nNF` da nota sob a qual a prova foi gravada — só para o
 * contador `ocrMismatch` (RF8); quem decide o alerta é a API (T3).
 */
export type PendingCanhotoNumberOcrProof = PendingCanhotoProof &
  Readonly<{ documentNumber: string | null }>

export type ListPendingCanhotoNumberOcrProofsParams = Readonly<{
  /** Quem já foi visto neste ciclo: falha de infraestrutura não carimba e voltaria no lote seguinte. */
  excludeProofIds: readonly string[]
  limit: number
}>

export type MarkCanhotoNumberOcrAttemptedParams = Readonly<{
  attemptedAt: Date
  companyId: string
  proofId: string
}>

export type CanhotoNumberOcrQueuePort = Readonly<{
  listPending: (
    params: ListPendingCanhotoNumberOcrProofsParams,
  ) => Promise<readonly PendingCanhotoNumberOcrProof[]>
  /** `false` quando a linha já não estava na fila do OCR (lida, decidida ou já carimbada): nada foi escrito. */
  markAttempted: (params: MarkCanhotoNumberOcrAttemptedParams) => Promise<boolean>
}>
