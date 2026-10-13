/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

export type ListPendingAutomaticMailParams = Readonly<{
  createdAfter: Date
  createdBefore: Date
  /** Quem já foi visto neste ciclo: uma recusa não grava registro e voltaria no lote seguinte. */
  excludeOccurrenceIds: readonly string[]
  limit: number
}>

export type PendingAutomaticMailOccurrence = Readonly<{ companyId: string; occurrenceId: string }>

export type OccurrenceAutomaticMailQueuePort = Readonly<{
  listPending: (
    params: ListPendingAutomaticMailParams,
  ) => Promise<readonly PendingAutomaticMailOccurrence[]>
}>
