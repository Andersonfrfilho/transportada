/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { NfeXmlImportError, type ImportedNfeXml } from '@adatechnology/fiscal-provider'

import type { NfeProcessingEnvelopeV1 } from '../../messaging/nfe-processing-envelope.schema.js'
import { normalizeTaxId } from '../../shared/tax-id.service.js'

type NfeImportSafeError = {
  readonly code: string
  readonly message: string
}

type NfeImportItemProcessingStatus = 'duplicated' | 'failed' | 'imported' | 'invalid' | 'rejected'

type PendingImportItem = {
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

type PendingImportAggregate = {
  readonly companyCnpj: string
  readonly companyId: string
  readonly id: string
  readonly items: readonly PendingImportItem[]
}

type ExpandedXmlEntry = {
  readonly entryName: string
  readonly sourceBytes: Uint8Array
  readonly sourceSha256: string
}

type NfeImportConsumerSummary = {
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

type NfeImportArchiveExpanderPort = {
  expand(input: {
    readonly contentType: PendingImportItem['sourceContentType']
    readonly sourceBytes: Uint8Array
    readonly sourceEntry: string
    readonly sourceName: string
  }): Promise<readonly ExpandedXmlEntry[]>
}

type NfeImportSourceStoragePort = {
  readSource(input: { readonly key: string }): Promise<Uint8Array>
}

type NfeImportStoredObject = {
  readonly bucket: string
  readonly key: string
  readonly objectId: string
  readonly sha256: string
  readonly sizeBytes: number
}

type NfeImportFinalStoragePort = {
  storeImportedDocument(input: {
    readonly accessKey: string
    readonly companyId: string
    readonly importId: string
    readonly sourceBytes: Uint8Array
    readonly sourceSha256: string
  }): Promise<NfeImportStoredObject>
  storeImportedEvent(input: {
    readonly accessKey: string
    readonly companyId: string
    readonly importId: string
    readonly sequence: string
    readonly sourceBytes: Uint8Array
    readonly sourceSha256: string
    readonly type: string
  }): Promise<NfeImportStoredObject>
}

type NfeXmlImporterPort = {
  importXml(input: { readonly xml: string }): Promise<ImportedNfeXml>
}

type NfeImportConsumerRepositoryPort = {
  completeItem(input: {
    readonly accessKey?: string
    readonly error?: NfeImportSafeError
    readonly finalObject?: NfeImportStoredObject
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

type NfeImportConsumer = {
  execute(input: { readonly envelope: NfeProcessingEnvelopeV1 }): Promise<NfeImportConsumerSummary>
}

export function createNfeImportConsumer(input: {
  readonly archiveExpander: NfeImportArchiveExpanderPort
  readonly finalStorage: NfeImportFinalStoragePort
  readonly repository: NfeImportConsumerRepositoryPort
  readonly sourceStorage: NfeImportSourceStoragePort
  readonly xmlImporter: NfeXmlImporterPort
}): NfeImportConsumer {
  return {
    async execute(params: {
      readonly envelope: NfeProcessingEnvelopeV1
    }): Promise<NfeImportConsumerSummary> {
      const pendingImport = await input.repository.getPendingImport({
        companyId: params.envelope.companyId,
        importId: params.envelope.payload.importId,
      })
      if (pendingImport === null) {
        throw new Error('NF-e import not found for worker consumption')
      }

      const itemResults: NfeImportItemProcessingStatus[] = []
      for (const item of pendingImport.items) {
        const itemResult = await processItem({
          archiveExpander: input.archiveExpander,
          companyCnpj: pendingImport.companyCnpj,
          companyId: pendingImport.companyId,
          finalStorage: input.finalStorage,
          repository: input.repository,
          sourceStorage: input.sourceStorage,
          xmlImporter: input.xmlImporter,
          item,
        })
        itemResults.push(itemResult)
      }

      return input.repository.finalizeImport({
        importId: pendingImport.id,
        summary: buildSummary({
          importId: pendingImport.id,
          itemStatuses: itemResults,
          receivedCount: pendingImport.items.length,
        }),
      })
    },
  }
}

async function processItem(input: {
  readonly archiveExpander: NfeImportArchiveExpanderPort
  readonly companyCnpj: string
  readonly companyId: string
  readonly finalStorage: NfeImportFinalStoragePort
  readonly repository: NfeImportConsumerRepositoryPort
  readonly sourceStorage: NfeImportSourceStoragePort
  readonly xmlImporter: NfeXmlImporterPort
  readonly item: PendingImportItem
}): Promise<NfeImportItemProcessingStatus> {
  try {
    const sourceBytes = await input.sourceStorage.readSource({
      key: input.item.sourceKey,
    })
    const [expandedXmlEntry] = await input.archiveExpander.expand({
      contentType: input.item.sourceContentType,
      sourceBytes,
      sourceEntry: input.item.sourceEntry,
      sourceName: input.item.sourceName,
    })
    if (expandedXmlEntry === undefined) {
      throw new Error('NFE_IMPORT_EMPTY_SOURCE')
    }

    const normalizedXml = await input.xmlImporter.importXml({
      xml: new TextDecoder().decode(expandedXmlEntry.sourceBytes),
    })
    const accessKey = resolveAccessKey(normalizedXml)
    const existingDocument = await input.repository.findExistingDocument({
      accessKey,
      companyId: input.companyId,
    })
    if (
      !isRelatedToCompany({
        accessKey,
        companyCnpj: input.companyCnpj,
        existingDocument,
        normalizedXml,
      })
    ) {
      await input.repository.completeItem({
        accessKey,
        error: {
          code: 'NFE_IMPORT_UNRELATED_CNPJ',
          message: 'NF-e is not related to the authenticated company',
        },
        itemId: input.item.id,
        normalizedXml,
        status: 'rejected',
        variant: resolveVariant(normalizedXml),
      })
      return 'rejected'
    }

    if (normalizedXml.kind !== 'nfe-event') {
      if (existingDocument !== null) {
        await input.repository.completeItem({
          accessKey,
          itemId: input.item.id,
          normalizedXml,
          status: 'duplicated',
          variant: resolveVariant(normalizedXml),
        })
        return 'duplicated'
      }
    }

    const finalObject =
      normalizedXml.kind === 'nfe-event'
        ? await input.finalStorage.storeImportedEvent({
            accessKey,
            companyId: input.companyId,
            importId: input.item.importId,
            sequence: normalizedXml.event.sequence,
            sourceBytes: expandedXmlEntry.sourceBytes,
            sourceSha256: expandedXmlEntry.sourceSha256,
            type: normalizedXml.event.type,
          })
        : await input.finalStorage.storeImportedDocument({
            accessKey,
            companyId: input.companyId,
            importId: input.item.importId,
            sourceBytes: expandedXmlEntry.sourceBytes,
            sourceSha256: expandedXmlEntry.sourceSha256,
          })

    await input.repository.completeItem({
      accessKey,
      finalObject,
      itemId: input.item.id,
      normalizedXml,
      status: 'imported',
      variant: resolveVariant(normalizedXml),
    })
    return 'imported'
  } catch (error: unknown) {
    const safeError = asSafeError(error)
    await input.repository.completeItem({
      error: safeError,
      itemId: input.item.id,
      status:
        safeError.code.startsWith('NFE_XML_') || safeError.code.startsWith('ZIP_')
          ? 'invalid'
          : 'failed',
    })
    return safeError.code.startsWith('NFE_XML_') || safeError.code.startsWith('ZIP_')
      ? 'invalid'
      : 'failed'
  }
}

function buildSummary(input: {
  readonly importId: string
  readonly itemStatuses: readonly NfeImportItemProcessingStatus[]
  readonly receivedCount: number
}): NfeImportConsumerSummary {
  const count = (status: NfeImportItemProcessingStatus): number =>
    input.itemStatuses.filter((itemStatus) => itemStatus === status).length
  const processedCount = input.itemStatuses.length
  const importedCount = count('imported')
  const duplicatedCount = count('duplicated')
  const invalidCount = count('invalid')
  const rejectedCount = count('rejected')
  const failedCount = count('failed')

  return {
    duplicatedCount,
    failedCount,
    id: input.importId,
    importedCount,
    invalidCount,
    processedCount,
    receivedCount: input.receivedCount,
    rejectedCount,
    status:
      failedCount === input.receivedCount
        ? 'failed'
        : invalidCount === 0 && rejectedCount === 0 && failedCount === 0
          ? 'completed'
          : 'partially_processed',
  }
}

/**
 * Os dois lados são canonicalizados antes de comparar: enquanto o CNPJ era só dígito, caixa e
 * pontuação não podiam divergir; com letra na base, `12abc…` e `12ABC…` são o mesmo documento e a
 * igualdade crua diria que a nota é de outra empresa.
 */
function isRelatedToCompany(input: {
  readonly accessKey: string
  readonly companyCnpj: string
  readonly existingDocument: { readonly documentId: string } | null
  readonly normalizedXml: ImportedNfeXml
}): boolean {
  const companyCnpj = normalizeTaxId(input.companyCnpj)

  if (input.normalizedXml.kind === 'nfe-event') {
    return (
      input.existingDocument !== null ||
      normalizeTaxId(input.accessKey).slice(6, 20) === companyCnpj
    )
  }

  return input.normalizedXml.document.relatedCnpjs
    .map((relatedCnpj) => normalizeTaxId(relatedCnpj))
    .includes(companyCnpj)
}

function resolveAccessKey(normalizedXml: ImportedNfeXml): string {
  if (normalizedXml.kind === 'nfe-event') {
    return normalizedXml.event.accessKey
  }

  return normalizedXml.document.accessKey
}

function resolveVariant(normalizedXml: ImportedNfeXml): 'complete' | 'event' {
  return normalizedXml.kind === 'nfe-event' ? 'event' : 'complete'
}

function asSafeError(error: unknown): NfeImportSafeError {
  if (error instanceof NfeXmlImportError) {
    return {
      code: error.code,
      message: error.message,
    }
  }
  if (error instanceof Error) {
    return {
      code: error.message || 'NFE_IMPORT_PROCESSING_FAILED',
      message: error.message || 'NF-e import processing failed',
    }
  }

  return {
    code: 'NFE_IMPORT_PROCESSING_FAILED',
    message: 'NF-e import processing failed',
  }
}
