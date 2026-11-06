/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { createDrizzleProvider } from '@adatechnology/drizzle-provider'
import { and, eq, inArray, sql } from 'drizzle-orm'

import { nfeAccessKeyLookups, nfeDocuments, nfeImports } from '../../database/nfe.schema.js'
import type { NfeDocumentStatusLogger } from '../../nfe-documents/types/nfe-document-status.types.js'
import type { NfeWriteTransaction } from '../../nfe-documents/types/nfe-write-transaction.types.js'
import type {
  AccessKeyLookupRecord,
  AccessKeyLookupRepositoryPort,
  CloseLookupWithoutDocumentInput,
} from '../application/process-access-key-lookup.types.js'
import { ACTIVE_LOOKUP_STATUSES } from '../domain/nfe-access-key-lookup.constant.js'
import {
  NFE_ACCESS_KEY_LOOKUP_ERROR_CODE,
  NfeAccessKeyLookupError,
} from '../domain/nfe-access-key-lookup.error.js'
import { importAccessKeyDocument } from './drizzle-access-key-lookup-import.persistence.js'
import {
  completeLookupImport,
  insertDuplicatedImportItem,
  lookupKeyCondition,
  markLookupImported,
} from './drizzle-access-key-lookup-statements.persistence.js'

type Database = ReturnType<typeof createDrizzleProvider>['db']

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
      .where(and(lookupKeyCondition(input.lookup), inArray(lookups.status, ACTIVE_LOOKUP_STATUSES)))
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
      .where(and(lookupKeyCondition(input.lookup), inArray(lookups.status, ACTIVE_LOOKUP_STATUSES)))
  }

  async closeWithoutDocument(input: CloseLookupWithoutDocumentInput): Promise<void> {
    await this.#database.transaction(async (tx) => {
      const closed = await tx
        .update(lookups)
        .set({
          cStat: input.cStat ?? null,
          finishedAt: input.now,
          notBefore: null,
          reason: input.reason,
          status: input.status,
          updatedAt: input.now,
        })
        .where(
          and(lookupKeyCondition(input.lookup), inArray(lookups.status, ACTIVE_LOOKUP_STATUSES)),
        )
        .returning({ id: lookups.id })
      if (closed.length === 0) return
      await this.#closeImportAsFailed(tx, input)
    })
  }

  async completeWithExistingDocument(input: {
    readonly documentId: string
    readonly lookup: AccessKeyLookupRecord
    readonly now: Date
  }): Promise<void> {
    const { documentId, lookup } = input
    await this.#database.transaction(async (tx) => {
      await markLookupImported(tx, input)
      await completeLookupImport(tx, { ...input, isDuplicate: true })
      if (lookup.importId === null) return

      const [existing] = await tx
        .select({ xmlObjectId: nfeDocuments.xmlObjectId, xmlSha256: nfeDocuments.xmlSha256 })
        .from(nfeDocuments)
        .where(and(eq(nfeDocuments.companyId, lookup.companyId), eq(nfeDocuments.id, documentId)))
        .limit(1)
      if (existing === undefined) {
        throw new NfeAccessKeyLookupError(NFE_ACCESS_KEY_LOOKUP_ERROR_CODE.DOCUMENT_MISSING)
      }
      await insertDuplicatedImportItem(tx, {
        accessKey: lookup.accessKey,
        companyId: lookup.companyId,
        importId: lookup.importId,
        sourceObjectId: existing.xmlObjectId,
        sourceSha256: existing.xmlSha256,
      })
    })
  }

  async importDocument(
    input: Parameters<AccessKeyLookupRepositoryPort['importDocument']>[0],
  ): ReturnType<AccessKeyLookupRepositoryPort['importDocument']> {
    return this.#database.transaction((tx) =>
      importAccessKeyDocument(tx, {
        ...input,
        logger: this.#logger,
        storageProvider: this.#storageProvider,
      }),
    )
  }

  async #closeImportAsFailed(
    tx: NfeWriteTransaction,
    input: CloseLookupWithoutDocumentInput,
  ): Promise<void> {
    const { lookup } = input
    if (lookup.importId === null) return
    await tx
      .update(nfeImports)
      .set({
        status: 'failed',
        terminalError: { reason: input.reason },
        updatedAt: input.now,
        version: sql`${nfeImports.version} + 1`,
      })
      .where(and(eq(nfeImports.companyId, lookup.companyId), eq(nfeImports.id, lookup.importId)))
  }
}
