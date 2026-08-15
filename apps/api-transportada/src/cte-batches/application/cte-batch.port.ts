/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteEmissionGroupingMode } from '../../database/cte-emission-profile.schema.js'
import type {
  CteBatchPreviewDocument,
  CteBatchPreviewLink,
  CteBatchPreviewNfseLink,
} from './cte-batch-preview.port.js'

export type CteBatchStatus = 'draft' | 'submitted' | 'in_flight' | 'done' | 'error' | 'cancelled'

export type CteBatchContext = {
  readonly companyId: string
  readonly userId: string
}

export type CteBatchRecord = Record<string, unknown> & {
  readonly companyId?: unknown
  readonly id?: unknown
  readonly status?: unknown
}

export type CteBatchFingerprintPort = {
  create(input: unknown): Promise<string> | string
}

export type CteBatchSelectionQuery = {
  readonly companyId: string
  readonly documentIds: readonly string[]
}

export type CteBatchItemLookup = {
  readonly batchId: string
  readonly companyId: string
  readonly itemId: string
}

export type CteBatchUnitOfWorkPort = {
  createBatch(input: Record<string, unknown>): Promise<Record<string, unknown>>
  createBatchEvent(input: Record<string, unknown>): Promise<void>
  createBatchItem(input: Record<string, unknown>): Promise<Record<string, unknown>>
  createBatchItemCharge(input: Record<string, unknown>): Promise<void>
  createBatchItemDocument(input: Record<string, unknown>): Promise<void>
  createFreightCalculation(input: Record<string, unknown>): Promise<Record<string, unknown>>
  createSubmissionRecord(input: Record<string, unknown>): Promise<void>
  deleteBatchItem(input: CteBatchItemLookup): Promise<{ readonly documentIds: readonly string[] }>
  execute?<TResponse>(
    operation: (transaction: CteBatchUnitOfWorkPort) => Promise<TResponse>,
  ): Promise<TResponse>
  findActiveBatchLinks(query: CteBatchSelectionQuery): Promise<readonly CteBatchPreviewLink[]>
  findActiveNfseLinks(query: CteBatchSelectionQuery): Promise<readonly CteBatchPreviewNfseLink[]>
  findBatch(input: Record<string, unknown>): Promise<CteBatchRecord | null>
  findBatchByIdempotency(input: Record<string, unknown>): Promise<Record<string, unknown> | null>
  findBatchItem(input: CteBatchItemLookup): Promise<Record<string, unknown> | null>
  findFreightRuleVersion(input: {
    readonly companyId: string
    readonly freightRuleId: string
  }): Promise<Record<string, unknown> | null>
  findSelectionDocuments(query: CteBatchSelectionQuery): Promise<readonly CteBatchPreviewDocument[]>
  findSubmissionRecord(input: Record<string, unknown>): Promise<Record<string, unknown> | null>
  /** Trava a linha do lote no estado esperado antes de mexer nos itens. */
  touchBatch(input: {
    readonly batchId: string
    readonly companyId: string
    readonly expectedStatus: CteBatchStatus
  }): Promise<void>
  updateBatchStatus(input: Record<string, unknown>): Promise<Record<string, unknown>>
}

export type CteBatchWriteInput = {
  readonly context: CteBatchContext
  readonly correlationId: string
  readonly documentIds: readonly string[]
  readonly emissionProfileId?: string | undefined
  readonly groupingMode?: CteEmissionGroupingMode | undefined
  readonly idempotencyKey: string
}

export type CreateCteBatchInput = CteBatchWriteInput & {
  readonly name: string
}

/**
 * Uma seleção grande chega fatiada por causa do corpo de 1 MiB, mas vira **um lote só**: a
 * primeira fatia cria e as demais acrescentam itens ao mesmo rascunho.
 */
export type AppendCteBatchItemsInput = CteBatchWriteInput & {
  readonly batchId: string
}

export type SubmitCteBatchInput = {
  readonly batchId: string
  readonly context: CteBatchContext
  readonly correlationId: string
  readonly idempotencyKey: string
}

export type CteBatchLookupInput = {
  readonly batchId: string
  readonly context: CteBatchContext
}

export type RemoveCteBatchItemInput = CteBatchLookupInput & {
  readonly correlationId: string
  readonly itemId: string
}

export type TransitionCteBatchInput = {
  readonly batchId: string
  readonly context: CteBatchContext
  readonly correlationId: string
  readonly nextStatus: CteBatchStatus
}
