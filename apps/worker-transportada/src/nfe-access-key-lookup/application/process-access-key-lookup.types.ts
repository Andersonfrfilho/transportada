/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ImportedNfeXml, NfeDistribuicaoConfig } from '@adatechnology/fiscal-provider'

import type {
  NfeAccessKeyLookupReason,
  NfeAccessKeyLookupStatus,
  NfeFiscalEnvironment,
} from '../../database/nfe.schema.js'
import type { NfeAccessKeyEnvelopeV1 } from '../../messaging/nfe-access-key-envelope.schema.js'
import type { PreparedDocument } from '../../nfe-distribution/infrastructure/nfe-distribution-item.mapper.js'
import type { WorkerLogger } from '../../shared/worker.types.js'
import type { AccessKeyLookupGatewayResult } from '../domain/nfe-access-key-lookup.types.js'

export type AccessKeyLookupRuntimeConfig = Omit<NfeDistribuicaoConfig, 'environment'> & {
  readonly environment: NfeFiscalEnvironment
}

export type AccessKeyLookupRecord = {
  readonly accessKey: string
  readonly companyId: string
  readonly environment: NfeFiscalEnvironment
  readonly id: string
  readonly importId: string | null
  readonly requestedByUserId: string
  readonly status: NfeAccessKeyLookupStatus
}

export type AccessKeyLookupStoredObject = {
  readonly bucket: string
  readonly key: string
  readonly objectId: string
  readonly sha256: string
  readonly sizeBytes: number
}

export type CloseLookupWithoutDocumentInput = {
  readonly cStat?: string
  readonly lookup: AccessKeyLookupRecord
  readonly now: Date
  readonly reason: NfeAccessKeyLookupReason
  readonly status: 'failed' | 'refused'
}

export type AccessKeyLookupRepositoryPort = {
  closeWithoutDocument(input: CloseLookupWithoutDocumentInput): Promise<void>
  completeWithExistingDocument(input: {
    readonly documentId: string
    readonly lookup: AccessKeyLookupRecord
    readonly now: Date
  }): Promise<void>
  findDocumentId(input: {
    readonly accessKey: string
    readonly companyId: string
  }): Promise<string | undefined>
  findLookup(input: {
    readonly companyId: string
    readonly lookupId: string
  }): Promise<AccessKeyLookupRecord | undefined>
  importDocument(input: {
    readonly cStat: string
    readonly lookup: AccessKeyLookupRecord
    readonly now: Date
    readonly prepared: PreparedDocument
    readonly storedObject: AccessKeyLookupStoredObject
  }): Promise<{ readonly documentId: string; readonly isDuplicate: boolean }>
  markQuerying(input: { readonly lookup: AccessKeyLookupRecord; readonly now: Date }): Promise<void>
  markWaiting(input: {
    readonly cStat?: string
    readonly lookup: AccessKeyLookupRecord
    readonly notBefore: Date
    readonly now: Date
  }): Promise<void>
}

export type AccessKeyLookupBudgetPort = {
  block656(input: BudgetScope): Promise<void>
  reserve(
    input: BudgetScope,
  ): Promise<
    | { readonly reserved: true; readonly budgetLeft: number }
    | { readonly reserved: false; readonly notBefore: Date }
  >
}

type BudgetScope = {
  readonly companyId: string
  readonly environment: NfeFiscalEnvironment
  readonly now: Date
}

export type AccessKeyLookupGateway = {
  consultarPorChave(input: {
    readonly chaveNfe: string
    readonly config: AccessKeyLookupRuntimeConfig
  }): Promise<AccessKeyLookupGatewayResult>
}

export type AccessKeyLookupDocumentStoragePort = {
  storeDocument(input: {
    readonly accessKey: string
    readonly companyId: string
    readonly importId: string
    readonly sourceBytes: Uint8Array
    readonly sourceSha256: string
  }): Promise<AccessKeyLookupStoredObject>
}

export type ProcessAccessKeyLookupDependencies = {
  readonly budget: AccessKeyLookupBudgetPort
  readonly clock: { now(): Date }
  readonly gatewayFactory: {
    create(input: { readonly config: AccessKeyLookupRuntimeConfig }): AccessKeyLookupGateway
  }
  readonly logger: WorkerLogger
  readonly processedMessages: {
    runOnce(params: {
      readonly companyId: string
      readonly consumerName: string
      readonly effect: () => Promise<{ readonly type: 'ack' }>
      readonly eventId: string
      readonly successResult: string
    }): Promise<{ readonly type: 'ack' }>
  }
  readonly profile: {
    loadConfig(input: { readonly companyId: string }): Promise<AccessKeyLookupRuntimeConfig>
    loadEnvironment(input: { readonly companyId: string }): Promise<NfeFiscalEnvironment>
  }
  readonly repository: AccessKeyLookupRepositoryPort
  readonly storage: AccessKeyLookupDocumentStoragePort
  readonly xmlImporter: {
    importXml(input: { readonly xml: string }): Promise<ImportedNfeXml>
  }
}

export type ProcessAccessKeyLookupUseCase = {
  abandon(envelope: NfeAccessKeyEnvelopeV1): Promise<void>
  execute(envelope: NfeAccessKeyEnvelopeV1): Promise<{ readonly type: 'ack' }>
}
