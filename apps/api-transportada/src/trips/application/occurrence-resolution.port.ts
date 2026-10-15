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

export type OccurrenceResolutionTransactionPort = {
  /** `undefined` quando a ocorrência não existe na empresa (ou não é de viagem). */
  readonly lockOccurrence: (input: OccurrenceTarget) => Promise<LockedOccurrence | undefined>
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
