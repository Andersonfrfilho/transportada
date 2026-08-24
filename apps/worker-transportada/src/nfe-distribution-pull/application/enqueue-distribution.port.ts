/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type {
  DISTRIBUTION_AGGREGATE_TYPE,
  DISTRIBUTION_AUTOMATION_TRIGGER,
  DISTRIBUTION_IMPORT_INITIAL_STATUS,
  DISTRIBUTION_IMPORT_SOURCE,
  DISTRIBUTION_PULL_JOB,
  DISTRIBUTION_REQUESTED_EVENT_TYPE,
} from '../domain/distribution-pull.constant.js'

/**
 * Os campos de vocabulário são tipados pela **constante**, não por `string`: é o que faz o `$type` das
 * colunas de `nfe_imports` recusar aqui um valor que o consumidor não saberia ler.
 */
export type DistributionImportRow = {
  readonly automationJob: typeof DISTRIBUTION_PULL_JOB
  readonly companyId: string
  readonly correlationId: string
  readonly id: string
  readonly idempotencyKey: string
  readonly receivedCount: bigint
  readonly requestFingerprint: string
  readonly requestedByUserId: string
  readonly source: typeof DISTRIBUTION_IMPORT_SOURCE
  readonly status: typeof DISTRIBUTION_IMPORT_INITIAL_STATUS
  readonly triggeredBy: typeof DISTRIBUTION_AUTOMATION_TRIGGER
}

export type DistributionOutboxRow = {
  readonly actorUserId: string
  readonly aggregateId: string
  readonly aggregateType: typeof DISTRIBUTION_AGGREGATE_TYPE
  readonly automationJob: typeof DISTRIBUTION_PULL_JOB
  readonly companyId: string
  readonly correlationId: string
  readonly eventId: string
  readonly eventType: typeof DISTRIBUTION_REQUESTED_EVENT_TYPE
  readonly eventVersion: bigint
  readonly payload: { readonly importId: string }
  readonly triggeredBy: typeof DISTRIBUTION_AUTOMATION_TRIGGER
}

/**
 * As duas linhas na mesma transação: a importação sem o evento é trabalho que ninguém pega, e o
 * evento sem a importação é mensagem que o consumidor recusa. Quem publica é o relay que já existia.
 */
export type DistributionEnqueuePlan = {
  readonly import: DistributionImportRow
  readonly outbox: DistributionOutboxRow
}

export type DistributionEnqueueResult = {
  readonly enqueued: boolean
}

export type DistributionEnqueueGatewayPort = {
  persist(plan: DistributionEnqueuePlan): Promise<DistributionEnqueueResult>
}

export type DistributionEnqueueIdentifiers = {
  nextEventId(): string
  nextImportId(): string
}
