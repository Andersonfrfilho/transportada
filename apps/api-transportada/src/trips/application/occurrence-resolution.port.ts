/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 266 / ADR-0105: o que o caso de uso de resolver precisa do banco. A unidade de trabalho abre a
 * transação; a ocorrência é travada (`FOR NO KEY UPDATE`) antes de ler o estado.
 */
import type { OccurrenceResolutionEventFact } from '../domain/occurrence-resolution.types.js'

export type OccurrenceKind = 'document' | 'stop'

export type OccurrenceTarget = {
  readonly companyId: string
  readonly occurrenceId: string
  readonly occurrenceKind: OccurrenceKind
}

export type LockedOccurrence = {
  /** ISO 8601; sempre `undefined` na ocorrência de parada, que não cancela. */
  readonly cancelledAt: string | undefined
}

export type InsertInternalResolutionInput = OccurrenceTarget & {
  readonly actorUserId: string
  readonly note: string
}

export type InsertedResolution = { readonly createdAt: string }

/**
 * Spec 317 (E13, T5b): o comprovante do PIX que o atendente mandou ao motorista no chat da ocorrência de parada.
 * `not_found`: o anexo não é de mensagem enviada pelo escritório na conversa do motorista desta ocorrência, nesta
 * empresa. `not_driver_paid`: a ocorrência não é uma cobrança paga pelo motorista — não há PIX a comprovar.
 */
export type RecordDriverPayoutReceiptInput = {
  readonly actorUserId: string
  readonly attachmentId: string
  readonly companyId: string
  readonly occurrenceId: string
}

export type RecordDriverPayoutReceiptOutcome = 'not_driver_paid' | 'not_found' | 'recorded'

export type OccurrenceResolutionTransactionPort = {
  /** `undefined` quando a ocorrência não existe na empresa (ou não é de viagem). */
  readonly lockOccurrence: (input: OccurrenceTarget) => Promise<LockedOccurrence | undefined>
  readonly recordDriverPayoutReceipt: (
    input: RecordDriverPayoutReceiptInput,
  ) => Promise<RecordDriverPayoutReceiptOutcome>
  readonly listLatestEvents: (
    input: OccurrenceTarget,
  ) => Promise<readonly OccurrenceResolutionEventFact[]>
  readonly insertInternalResolution: (
    input: InsertInternalResolutionInput,
  ) => Promise<InsertedResolution>
}

export type OccurrenceResolutionUnitOfWork = {
  readonly execute: <TResult>(
    operation: (transaction: OccurrenceResolutionTransactionPort) => Promise<TResult>,
  ) => Promise<TResult>
}
