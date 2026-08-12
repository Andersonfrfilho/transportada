/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import type { ImportedNfeXml } from '@adatechnology/fiscal-provider'
import { and, eq, inArray, sql } from 'drizzle-orm'

import {
  type NfeFiscalEnvironment,
  type NfeItemVariant,
  nfeDocuments,
  nfeEvents,
  nfeImportItems,
  nfeImports,
  storedObjects,
} from '../../database/nfe.schema.js'
import {
  type NfeWriteTransaction,
  writeDocumentChildren,
} from '../../nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const XML_MIME_TYPE = 'application/xml'
const DEFAULT_STORAGE_PROVIDER = 'minio'
const DISTRIBUTION_SOURCE = 'distribution' as const

export type DistributionStoredObject = {
  readonly bucket: string
  readonly key: string
  readonly objectId: string
  readonly sha256: string
  readonly sizeBytes: number
}

export type DistributionSummary = {
  readonly accessKey?: string
  readonly emitterCnpj?: string
  readonly issuedAt?: string
  readonly situacao?: string
  readonly totalValue?: string
}

export type DistributionPersistItem = {
  readonly finalObject: DistributionStoredObject
  readonly normalizedXml?: ImportedNfeXml
  readonly nsu: string
  readonly summary?: DistributionSummary
  readonly variant: NfeItemVariant
}

export type PersistPageInput = {
  readonly companyId: string
  readonly environment: NfeFiscalEnvironment
  readonly importId: string
  readonly items: readonly DistributionPersistItem[]
  readonly maxNsu: string
  readonly ultNsu: string
}

export type PersistPageResult = {
  readonly acceptedCount: number
  readonly documentCount: number
  readonly duplicatedCount: number
  readonly eventCount: number
  readonly summaryCount: number
}

type DrizzleNfeDistributionRepositoryOptions = {
  readonly storageProvider?: string
}

type ItemOutcome = {
  readonly accepted: boolean
  readonly document: boolean
  readonly event: boolean
  readonly summary: boolean
}

const SKIPPED_OUTCOME: ItemOutcome = {
  accepted: false,
  document: false,
  event: false,
  summary: false,
}

export class DrizzleNfeDistributionRepository {
  readonly #database: Database
  readonly #storageProvider: string

  constructor(database: Database, options: DrizzleNfeDistributionRepositoryOptions = {}) {
    this.#database = database
    this.#storageProvider = options.storageProvider ?? DEFAULT_STORAGE_PROVIDER
  }

  async finalizeImport(input: {
    readonly companyId: string
    readonly duplicatedCount: number
    readonly importId: string
    readonly importedCount: number
    readonly invalidCount: number
    readonly processedCount: number
    readonly receivedCount: number
    readonly status: 'completed'
  }): Promise<void> {
    await this.#database
      .update(nfeImports)
      .set({
        duplicatedCount: BigInt(input.duplicatedCount),
        importedCount: BigInt(input.importedCount),
        invalidCount: BigInt(input.invalidCount),
        processedCount: BigInt(input.processedCount),
        receivedCount: BigInt(input.receivedCount),
        status: input.status,
        updatedAt: new Date(),
        version: sql`${nfeImports.version} + 1`,
      })
      .where(and(eq(nfeImports.companyId, input.companyId), eq(nfeImports.id, input.importId)))
  }

  /**
   * Só `variant: 'complete'` grava linha em `nfe_documents` — quem já está aqui tem o XML inteiro, e
   * receber a mesma chave de novo pela distribuição não acrescenta nada.
   */
  async findStoredAccessKeys(input: {
    readonly accessKeys: readonly string[]
    readonly companyId: string
  }): Promise<readonly string[]> {
    if (input.accessKeys.length === 0) {
      return []
    }

    const rows = await this.#database
      .select({ accessKey: nfeDocuments.accessKey })
      .from(nfeDocuments)
      .where(
        and(
          eq(nfeDocuments.companyId, input.companyId),
          inArray(nfeDocuments.accessKey, [...input.accessKeys]),
        ),
      )
    return rows.map((row) => row.accessKey)
  }

  async persistPage(input: PersistPageInput): Promise<PersistPageResult> {
    const [run] = await this.#database
      .select({ requestedByUserId: nfeImports.requestedByUserId })
      .from(nfeImports)
      .where(and(eq(nfeImports.companyId, input.companyId), eq(nfeImports.id, input.importId)))
      .limit(1)
    if (run === undefined) {
      throw new Error('NFE_DISTRIBUTION_RUN_NOT_FOUND')
    }

    let acceptedCount = 0
    let documentCount = 0
    let duplicatedCount = 0
    let eventCount = 0
    let summaryCount = 0

    for (const item of input.items) {
      const outcome = await this.#persistItem({
        companyId: input.companyId,
        createdByUserId: run.requestedByUserId,
        environment: input.environment,
        importId: input.importId,
        item,
      })

      if (!outcome.accepted) {
        duplicatedCount += 1
        continue
      }
      acceptedCount += 1
      if (outcome.document) documentCount += 1
      if (outcome.event) eventCount += 1
      if (outcome.summary) summaryCount += 1
    }

    await this.#database
      .update(nfeImports)
      .set({
        duplicatedCount: sql`${nfeImports.duplicatedCount} + ${duplicatedCount}`,
        importedCount: sql`${nfeImports.importedCount} + ${acceptedCount}`,
        processedCount: sql`${nfeImports.processedCount} + ${input.items.length}`,
        receivedCount: sql`${nfeImports.receivedCount} + ${input.items.length}`,
        updatedAt: new Date(),
        version: sql`${nfeImports.version} + 1`,
      })
      .where(and(eq(nfeImports.companyId, input.companyId), eq(nfeImports.id, input.importId)))

    return { acceptedCount, documentCount, duplicatedCount, eventCount, summaryCount }
  }

  async #persistItem(params: {
    readonly companyId: string
    readonly createdByUserId: string
    readonly environment: NfeFiscalEnvironment
    readonly importId: string
    readonly item: DistributionPersistItem
  }): Promise<ItemOutcome> {
    const { companyId, createdByUserId, environment, importId, item } = params

    return this.#database.transaction(async (tx) => {
      const [existingItem] = await tx
        .select({ id: nfeImportItems.id })
        .from(nfeImportItems)
        .where(
          and(
            eq(nfeImportItems.companyId, companyId),
            eq(nfeImportItems.importId, importId),
            eq(nfeImportItems.sourceNsu, item.nsu),
          ),
        )
        .limit(1)
      if (existingItem !== undefined) {
        return SKIPPED_OUTCOME
      }

      await this.#insertStoredObject({ companyId, item, tx })

      const accessKey = resolveAccessKey(item)
      let document = false
      let event = false
      let summary = false

      if (item.variant === 'summary') {
        summary = true
      } else if (item.variant === 'event') {
        event = await this.#insertEvent({ companyId, environment, item, tx })
      } else {
        document = await this.#insertDocument({ companyId, createdByUserId, importId, item, tx })
      }

      await tx.insert(nfeImportItems).values({
        accessKey: accessKey ?? null,
        companyId,
        environment,
        importId,
        ordinal: BigInt(item.nsu),
        sourceEntry: item.nsu,
        sourceName: `dfe-${item.nsu}.xml`,
        sourceNsu: item.nsu,
        sourceObjectId: item.finalObject.objectId,
        sourceSha256: item.finalObject.sha256,
        status: 'imported',
        variant: item.variant,
      })

      return { accepted: true, document, event, summary }
    })
  }

  async #insertStoredObject(params: {
    readonly companyId: string
    readonly item: DistributionPersistItem
    readonly tx: NfeWriteTransaction
  }): Promise<void> {
    const { companyId, item, tx } = params
    await tx
      .insert(storedObjects)
      .values({
        bucket: item.finalObject.bucket,
        companyId,
        id: item.finalObject.objectId,
        mimeType: XML_MIME_TYPE,
        objectKey: item.finalObject.key,
        provider: this.#storageProvider,
        purpose: item.variant === 'event' ? 'nfe_event' : 'nfe_document',
        sha256: item.finalObject.sha256,
        sizeBytes: BigInt(item.finalObject.sizeBytes),
        status: 'final',
      })
      .onConflictDoNothing({
        target: [
          storedObjects.companyId,
          storedObjects.provider,
          storedObjects.bucket,
          storedObjects.objectKey,
        ],
      })
  }

  async #insertEvent(params: {
    readonly companyId: string
    readonly environment: NfeFiscalEnvironment
    readonly item: DistributionPersistItem
    readonly tx: NfeWriteTransaction
  }): Promise<boolean> {
    const { companyId, environment, item, tx } = params
    const normalizedXml = item.normalizedXml
    if (normalizedXml === undefined || normalizedXml.kind !== 'nfe-event') {
      throw new Error('NFE_DISTRIBUTION_EVENT_MISSING_XML')
    }

    const inserted = await tx
      .insert(nfeEvents)
      .values({
        companyId,
        environment,
        eventSequence: BigInt(normalizedXml.event.sequence),
        eventType: normalizedXml.event.type,
        occurredAt: new Date(normalizedXml.event.occurredAt),
        sourceNsu: item.nsu,
        targetAccessKey: normalizedXml.event.accessKey,
        xmlObjectId: item.finalObject.objectId,
      })
      .onConflictDoNothing({
        target: [
          nfeEvents.companyId,
          nfeEvents.targetAccessKey,
          nfeEvents.eventType,
          nfeEvents.eventSequence,
        ],
      })
      .returning({ id: nfeEvents.id })

    return inserted.length > 0
  }

  async #insertDocument(params: {
    readonly companyId: string
    readonly createdByUserId: string
    readonly importId: string
    readonly item: DistributionPersistItem
    readonly tx: NfeWriteTransaction
  }): Promise<boolean> {
    const { companyId, createdByUserId, importId, item, tx } = params
    const normalizedXml = item.normalizedXml
    if (normalizedXml === undefined || normalizedXml.kind === 'nfe-event') {
      throw new Error('NFE_DISTRIBUTION_DOCUMENT_MISSING_XML')
    }

    const document = normalizedXml.document
    const [created] = await tx
      .insert(nfeDocuments)
      .values({
        accessKey: document.accessKey,
        additionalInformation: document.additionalInformation ?? null,
        authorizationProtocol: document.protocol?.number ?? null,
        companyId,
        createdByUserId,
        discountValue: document.totals.discount ?? '0',
        freightValue: document.totals.freight ?? '0',
        importId,
        insuranceValue: document.totals.insurance ?? '0',
        issuedAt: new Date(document.issuedAt),
        model: document.model,
        number: document.number,
        operationNature: document.operationNature,
        operationType: document.operationType,
        otherExpensesValue: document.totals.otherExpenses ?? '0',
        productsValue: document.totals.products,
        series: document.series,
        source: DISTRIBUTION_SOURCE,
        status: document.status,
        totalValue: document.totals.invoice,
        xmlObjectId: item.finalObject.objectId,
        xmlSha256: item.finalObject.sha256,
      })
      .onConflictDoNothing({ target: [nfeDocuments.companyId, nfeDocuments.accessKey] })
      .returning({ id: nfeDocuments.id })

    if (created === undefined) {
      return false
    }

    await writeDocumentChildren({ companyId, document, documentId: created.id, tx })
    return true
  }
}

function resolveAccessKey(item: DistributionPersistItem): string | undefined {
  if (item.variant === 'summary') {
    return item.summary?.accessKey
  }
  const normalizedXml = item.normalizedXml
  if (normalizedXml === undefined) {
    throw new Error('NFE_DISTRIBUTION_ITEM_MISSING_XML')
  }
  return normalizedXml.kind === 'nfe-event'
    ? normalizedXml.event.accessKey
    : normalizedXml.document.accessKey
}
