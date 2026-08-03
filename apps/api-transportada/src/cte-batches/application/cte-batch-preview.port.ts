/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { CteEmissionProfileDetail } from '../../cte-profiles/application/cte-emission-profile.port.js'
import type { CteEmissionGroupingMode } from '../../database/cte-emission-profile.schema.js'
import type { CteBatchBlockReason } from '../domain/cte-batch-eligibility.policy.js'
import type { CteBatchProjection } from '../domain/cte-batch-projection.service.js'

export type CteBatchPreviewDocument = {
  readonly accessKey: string
  readonly companyId: string
  readonly grossWeight: string | null
  readonly id: string
  readonly issuedAt: string
  readonly number: string
  readonly recipientCity: string | null
  readonly recipientState: string | null
  readonly recipientTaxId: string | null
  readonly senderCity: string | null
  readonly senderState: string | null
  readonly senderTaxId: string | null
  readonly series: string
  readonly status: string
  readonly totalAmount: string | null
  readonly variant: string
}

export type CteBatchPreviewLink = {
  readonly batchId: string
  readonly documentId: string
}

export type CteBatchPreviewQuery = {
  readonly companyId: string
  readonly documentIds: readonly string[]
}

export type CteBatchNameQuery = {
  readonly companyId: string
  readonly prefix: string
}

export type CteBatchPreviewReaderPort = {
  findActiveBatchLinks(query: CteBatchPreviewQuery): Promise<readonly CteBatchPreviewLink[]>
  findBatchNamesStartingWith(query: CteBatchNameQuery): Promise<readonly string[]>
  findPreviewDocuments(query: CteBatchPreviewQuery): Promise<readonly CteBatchPreviewDocument[]>
}

export type CteBatchClockPort = {
  now(): Date
}

export type CteEmissionProfileCatalogPort = {
  listProfiles(input: { readonly companyId: string }): Promise<readonly CteEmissionProfileDetail[]>
}

export type PreviewCteBatchInput = {
  readonly context: {
    readonly companyId: string
    readonly userId: string
  }
  readonly documentIds: readonly string[]
  readonly emissionProfileId?: string
  readonly groupingMode?: CteEmissionGroupingMode
}

export type CteBatchPreviewBlock = {
  readonly batchId: string | null
  readonly documentId: string
  readonly reason: CteBatchBlockReason | string
}

export type CteBatchPreviewResult = {
  readonly blocked: readonly CteBatchPreviewBlock[]
  readonly projections: readonly CteBatchProjection[]
  readonly suggestedName: string
  readonly summary: {
    readonly blockedCount: number
    readonly documentCount: number
    readonly projectedCount: number
    readonly totalAmount: string
  }
}
