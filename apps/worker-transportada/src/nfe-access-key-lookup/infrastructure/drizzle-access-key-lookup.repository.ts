/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, sql } from 'drizzle-orm'

import {
  type NfeAccessKeyLookupReason,
  nfeAccessKeyLookups,
  nfeDocuments,
  nfeImportItems,
  nfeImports,
  storedObjects,
} from '../../database/nfe.schema.js'
import { resolveNfeEventOrigin } from '../../nfe-documents/domain/nfe-event-origin.policy.js'
import { lockAccessKey } from '../../nfe-documents/infrastructure/drizzle-nfe-document-status.persistence.js'
import {
  recordDocumentInsertChange,
  resolveInitialDocumentStatus,
} from '../../nfe-documents/infrastructure/nfe-document-status-write.persistence.js'
import type { NfeDocumentStatusLogger } from '../../nfe-documents/types/nfe-document-status.types.js'
import type { NfeWriteTransaction } from '../../nfe-documents/types/nfe-write-transaction.types.js'
import { resolveRecipientEmail } from '../../nfe-imports/domain/recipient-email.policy.js'
import { writeDocumentChildren } from '../../nfe-imports/infrastructure/drizzle-nfe-import-consumer.repository.js'
import { ACTIVE_LOOKUP_STATUSES } from '../domain/nfe-access-key-lookup.constant.js'
import type {
  AccessKeyLookupRecord,
  AccessKeyLookupRepositoryPort,
  AccessKeyLookupStoredObject,
} from '../application/process-access-key-lookup.types.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

const XML_MIME_TYPE = 'application/xml'
const ACCESS_KEY_SOURCE = 'access_key' as const
const DEFAULT_STORAGE_PROVIDER = 'minio'
const lookups = nfeAccessKeyLookups

export class DrizzleAccessKeyLookupRepository implements AccessKeyLookupRepositoryPort {
  readonly #database: Database
  readonly #logger: NfeDocumentStatusLogger
  readonly #storageProvider: string

  constructor(
    database: Database,
    options: { readonly logger: NfeDocumentStatusLogger; readonly storageProvider?: string },
  ) {
    this.#database = database
    this.#logger = options.logger
    this.#storageProvider = options.storageProvider ?? DEFAULT_STORAGE_PROVIDER
  }

  async findLookup(input: {
    readonly companyId: string
    readonly lookupId: string
  }): Promise<AccessKeyLookupRecord | undefined> {
    const [row] = await this.#database
      .select({
        accessKey: lookups.accessKey,
        companyId: lookups.companyId,
        environment: lookups.environment,
        id: lookups.id,
        importId: lookups.importId,
        requestedByUserId: lookups.requestedByUserId,
        status: lookups.status,
      })
      .from(lookups)
      .where(and(eq(lookups.companyId, input.companyId), eq(lookups.id, input.lookupId)))
      .limit(1)
    return row
  }

  async findDocumentId(input: {
    readonly accessKey: string
    readonly companyId: string
  }): Promise<string | undefined> {
    const [row] = await this.#database
      .select({ id: nfeDocuments.id })
      .from(nfeDocuments)
      .where(
        and(
          eq(nfeDocuments.companyId, input.companyId),
          eq(nfeDocuments.accessKey, input.accessKey),
        ),
      )
      .limit(1)
    return row?.id
  }

  async markQuerying(input: {
    readonly lookup: AccessKeyLookupRecord
    readonly now: Date
  }): Promise<void> {
    await this.#database
      .update(lookups)
      .set({
        attempts: sql`${lookups.attempts} + 1`,
        notBefore: null,
        status: 'querying',
        updatedAt: input.now,
      })
      .where(and(this.#lookupKey(input.lookup), inArray(lookups.status, ACTIVE_LOOKUP_STATUSES)))
  }

  async markWaiting(input: {
    readonly cStat?: string
    readonly lookup: AccessKeyLookupRecord
    readonly notBefore: Date
    readonly now: Date
  }): Promise<void> {
    await this.#database
      .update(lookups)
      .set({
        cStat: input.cStat ?? null,
        notBefore: input.notBefore,
        status: 'waiting',
        updatedAt: input.now,
      })
      .where(this.#lookupKey(input.lookup))
  }

  async closeWithoutDocument(input: {
    readonly cStat?: string
    readonly lookup: AccessKeyLookupRecord
    readonly now: Date
    readonly reason: NfeAccessKeyLookupReason
    readonly status: 'failed' | 'refused'
  }): Promise<void> {
    await this.#database.transaction(async (tx) => {
      await tx
        .update(lookups)
        .set({
          cStat: input.cStat ?? null,
          finishedAt: input.now,
          notBefore: null,
          reason: input.reason,
          status: input.status,
          updatedAt: input.now,
        })
        .where(this.#lookupKey(input.lookup))
      await this.#closeImportAsFailed(tx, input.lookup, input.reason, input.now)
    })
  }

  async completeWithExistingDocument(input: {
    readonly documentId: string
    readonly lookup: AccessKeyLookupRecord
    readonly now: Date
  }): Promise<void> {
    await this.#database.transaction(async (tx) => {
      await this.#markImported(tx, input)
      await this.#completeImport(tx, { ...input, isDuplicate: true })
    })
  }

  async importDocument(
    input: Parameters<AccessKeyLookupRepositoryPort['importDocument']>[0],
  ): ReturnType<AccessKeyLookupRepositoryPort['importDocument']> {
    const { lookup, prepared } = input
    const importId = lookup.importId
    if (importId === null) throw new Error('NFE_ACCESS_KEY_LOOKUP_IMPORT_MISSING')

    return this.#database.transaction(async (tx) => {
      await lockAccessKey({ accessKey: lookup.accessKey, companyId: lookup.companyId, tx })
      const objectId = await this.#insertStoredObject(tx, lookup.companyId, input.storedObject)
      const created = await this.#insertDocument(tx, { ...input, importId, objectId })
      const documentId =
        created ?? (await this.#findExistingDocumentId(tx, lookup.companyId, lookup.accessKey))
      const isDuplicate = created === undefined

      await tx.insert(nfeImportItems).values({
        accessKey: lookup.accessKey,
        companyId: lookup.companyId,
        importId,
        ordinal: 1n,
        sourceEntry: lookup.accessKey,
        sourceName: `${lookup.accessKey}.xml`,
        sourceObjectId: objectId,
        sourceSha256: prepared.sourceSha256,
        status: isDuplicate ? 'duplicated' : 'imported',
        variant: 'complete',
      })
      await this.#markImported(tx, { cStat: input.cStat, documentId, lookup, now: input.now })
      await this.#completeImport(tx, { isDuplicate, lookup, now: input.now })
      return { documentId, isDuplicate }
    })
  }

  #lookupKey(lookup: AccessKeyLookupRecord) {
    return and(eq(lookups.companyId, lookup.companyId), eq(lookups.id, lookup.id))
  }

  async #markImported(
    tx: NfeWriteTransaction,
    input: {
      readonly cStat?: string
      readonly documentId: string
      readonly lookup: AccessKeyLookupRecord
      readonly now: Date
    },
  ): Promise<void> {
    await tx
      .update(lookups)
      .set({
        cStat: input.cStat ?? null,
        documentId: input.documentId,
        finishedAt: input.now,
        notBefore: null,
        reason: null,
        status: 'imported',
        updatedAt: input.now,
      })
      .where(this.#lookupKey(input.lookup))
  }

  async #completeImport(
    tx: NfeWriteTransaction,
    input: {
      readonly isDuplicate: boolean
      readonly lookup: AccessKeyLookupRecord
      readonly now: Date
    },
  ): Promise<void> {
    if (input.lookup.importId === null) return
    await tx
      .update(nfeImports)
      .set({
        duplicatedCount: input.isDuplicate ? 1n : 0n,
        importedCount: input.isDuplicate ? 0n : 1n,
        processedCount: 1n,
        receivedCount: 1n,
        status: 'completed',
        updatedAt: input.now,
        version: sql`${nfeImports.version} + 1`,
      })
      .where(
        and(
          eq(nfeImports.companyId, input.lookup.companyId),
          eq(nfeImports.id, input.lookup.importId),
        ),
      )
  }

  async #closeImportAsFailed(
    tx: NfeWriteTransaction,
    lookup: AccessKeyLookupRecord,
    reason: string,
    now: Date,
  ): Promise<void> {
    if (lookup.importId === null) return
    await tx
      .update(nfeImports)
      .set({
        status: 'failed',
        terminalError: { reason },
        updatedAt: now,
        version: sql`${nfeImports.version} + 1`,
      })
      .where(and(eq(nfeImports.companyId, lookup.companyId), eq(nfeImports.id, lookup.importId)))
  }

  /** O objeto pode já ter linha (a distribuição grava o mesmo endereço): vale o id que existe. */
  async #insertStoredObject(
    tx: NfeWriteTransaction,
    companyId: string,
    object: AccessKeyLookupStoredObject,
  ): Promise<string> {
    await tx
      .insert(storedObjects)
      .values({
        bucket: object.bucket,
        companyId,
        id: object.objectId,
        mimeType: XML_MIME_TYPE,
        objectKey: object.key,
        provider: this.#storageProvider,
        purpose: 'nfe_document',
        sha256: object.sha256,
        sizeBytes: BigInt(object.sizeBytes),
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
    const [row] = await tx
      .select({ id: storedObjects.id })
      .from(storedObjects)
      .where(
        and(
          eq(storedObjects.companyId, companyId),
          eq(storedObjects.provider, this.#storageProvider),
          eq(storedObjects.bucket, object.bucket),
          eq(storedObjects.objectKey, object.key),
        ),
      )
      .limit(1)
    if (row === undefined) throw new Error('NFE_ACCESS_KEY_LOOKUP_STORED_OBJECT_MISSING')
    return row.id
  }

  async #findExistingDocumentId(
    tx: NfeWriteTransaction,
    companyId: string,
    accessKey: string,
  ): Promise<string> {
    const [row] = await tx
      .select({ id: nfeDocuments.id })
      .from(nfeDocuments)
      .where(and(eq(nfeDocuments.companyId, companyId), eq(nfeDocuments.accessKey, accessKey)))
      .limit(1)
    if (row === undefined) throw new Error('NFE_ACCESS_KEY_LOOKUP_DOCUMENT_MISSING')
    return row.id
  }

  /** `undefined` quando a nota já existia (a distribuição chegou primeiro). */
  async #insertDocument(
    tx: NfeWriteTransaction,
    input: Parameters<AccessKeyLookupRepositoryPort['importDocument']>[0] & {
      readonly importId: string
      readonly objectId: string
    },
  ): Promise<string | undefined> {
    const { lookup, objectId, prepared } = input
    const normalizedXml = prepared.normalizedXml
    if (normalizedXml.kind === 'nfe-event') throw new Error('NFE_ACCESS_KEY_LOOKUP_NOT_A_DOCUMENT')

    const document = normalizedXml.document
    const recipientEmail = resolveRecipientEmail(document.recipient?.email)
    const initial = await resolveInitialDocumentStatus({
      accessKey: document.accessKey,
      companyId: lookup.companyId,
      tx,
      xmlStatus: document.status,
    })
    const [created] = await tx
      .insert(nfeDocuments)
      .values({
        accessKey: document.accessKey,
        additionalInformation: document.additionalInformation ?? null,
        authorizationProtocol: document.protocol?.number ?? null,
        companyId: lookup.companyId,
        createdByUserId: lookup.requestedByUserId,
        discountValue: document.totals.discount ?? '0',
        freightValue: document.totals.freight ?? '0',
        importId: input.importId,
        insuranceValue: document.totals.insurance ?? '0',
        issuedAt: new Date(document.issuedAt),
        model: document.model,
        number: document.number,
        operationNature: document.operationNature,
        operationType: document.operationType,
        otherExpensesValue: document.totals.otherExpenses ?? '0',
        productsValue: document.totals.products,
        recipientEmail: recipientEmail.email,
        series: document.series,
        source: ACCESS_KEY_SOURCE,
        status: initial.status,
        totalValue: document.totals.invoice,
        xmlObjectId: objectId,
        xmlSha256: prepared.sourceSha256,
      })
      .onConflictDoNothing({ target: [nfeDocuments.companyId, nfeDocuments.accessKey] })
      .returning({ createdAt: sql<string>`${nfeDocuments.createdAt}::text`, id: nfeDocuments.id })
    if (created === undefined) return undefined

    await recordDocumentInsertChange({
      companyId: lookup.companyId,
      createdAt: created.createdAt,
      documentId: created.id,
      pendingEventId: initial.pendingEventId,
      provenance: resolveNfeEventOrigin({
        importId: input.importId,
        requestedByUserId: lookup.requestedByUserId,
        source: ACCESS_KEY_SOURCE,
      }),
      status: initial.status,
      tx,
      xmlStatus: document.status,
    })
    await writeDocumentChildren({
      companyId: lookup.companyId,
      document,
      documentId: created.id,
      logger: this.#logger,
      tx,
    })
    return created.id
  }
}
