/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ImportedNfeXml } from '@adatechnology/fiscal-provider'

import type { NfeProcessingEnvelopeV1 } from '../../src/messaging/nfe-processing-envelope.schema.js'

export type NfeImportSafeError = {
  readonly code: string
  readonly message: string
}

export type NfeImportItemProcessingStatus =
  | 'duplicated'
  | 'failed'
  | 'imported'
  | 'invalid'
  | 'rejected'

export type PendingImportItem = {
  readonly attempt: number
  readonly id: string
  readonly importId: string
  readonly ordinal: number
  readonly sourceContentType: 'application/xml' | 'application/zip'
  readonly sourceEntry: string
  readonly sourceKey: string
  readonly sourceName: string
  readonly sourceSha256: string
}

export type PendingImportAggregate = {
  readonly companyCnpj: string
  readonly companyId: string
  readonly id: string
  readonly items: readonly PendingImportItem[]
}

export type ExpandedXmlEntry = {
  readonly entryName: string
  readonly sourceBytes: Uint8Array
  readonly sourceSha256: string
}

export type NfeImportConsumerSummary = {
  readonly duplicatedCount: number
  readonly failedCount: number
  readonly id: string
  readonly importedCount: number
  readonly invalidCount: number
  readonly processedCount: number
  readonly receivedCount: number
  readonly rejectedCount: number
  readonly status: 'completed' | 'failed' | 'partially_processed'
}

export type NfeImportArchiveExpanderPort = {
  expand(input: {
    readonly contentType: PendingImportItem['sourceContentType']
    readonly sourceBytes: Uint8Array
    readonly sourceEntry: string
    readonly sourceName: string
  }): Promise<readonly ExpandedXmlEntry[]>
}

export type NfeImportSourceStoragePort = {
  readSource(input: { readonly key: string }): Promise<Uint8Array>
}

export type NfeImportFinalStoragePort = {
  storeImportedDocument(input: {
    readonly accessKey: string
    readonly companyId: string
    readonly importId: string
    readonly sourceBytes: Uint8Array
    readonly sourceSha256: string
  }): Promise<{ readonly bucket: string; readonly key: string; readonly sha256: string }>
  storeImportedEvent(input: {
    readonly accessKey: string
    readonly companyId: string
    readonly importId: string
    readonly sequence: string
    readonly sourceBytes: Uint8Array
    readonly sourceSha256: string
    readonly type: string
  }): Promise<{ readonly bucket: string; readonly key: string; readonly sha256: string }>
}

export type NfeXmlImporterPort = {
  importXml(input: { readonly xml: string }): Promise<ImportedNfeXml>
}

export type NfeImportConsumerRepositoryPort = {
  completeItem(input: {
    readonly accessKey?: string
    readonly error?: NfeImportSafeError
    readonly finalObject?: {
      readonly bucket: string
      readonly key: string
      readonly sha256: string
    }
    readonly itemId: string
    readonly normalizedXml?: ImportedNfeXml
    readonly status: NfeImportItemProcessingStatus
    readonly variant?: 'complete' | 'event'
  }): Promise<void>
  finalizeImport(input: {
    readonly importId: string
    readonly summary: NfeImportConsumerSummary
  }): Promise<NfeImportConsumerSummary>
  findExistingDocument(input: {
    readonly accessKey: string
    readonly companyId: string
  }): Promise<{ readonly documentId: string } | null>
  getPendingImport(input: {
    readonly companyId: string
    readonly importId: string
  }): Promise<PendingImportAggregate | null>
}

export type NfeImportConsumer = {
  execute(input: { readonly envelope: NfeProcessingEnvelopeV1 }): Promise<NfeImportConsumerSummary>
}

type CreateNfeImportConsumer = (input: {
  readonly archiveExpander: NfeImportArchiveExpanderPort
  readonly finalStorage: NfeImportFinalStoragePort
  readonly repository: NfeImportConsumerRepositoryPort
  readonly sourceStorage: NfeImportSourceStoragePort
  readonly xmlImporter: NfeXmlImporterPort
}) => NfeImportConsumer

export async function createNfeImportConsumerFixture(input: {
  readonly archiveExpander: NfeImportArchiveExpanderPort
  readonly finalStorage: NfeImportFinalStoragePort
  readonly repository: NfeImportConsumerRepositoryPort
  readonly sourceStorage: NfeImportSourceStoragePort
  readonly xmlImporter: NfeXmlImporterPort
}): Promise<NfeImportConsumer> {
  const module = (await import(
    '../../src/nfe-imports/application/nfe-import-consumer.service.js'
  )) as {
    readonly createNfeImportConsumer: CreateNfeImportConsumer
  }

  return module.createNfeImportConsumer(input)
}
