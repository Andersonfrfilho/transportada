/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq, inArray, sql } from 'drizzle-orm'

import { nfeAccessKeyLookups, nfeImportItems, nfeImports } from '../../database/nfe.schema.js'
import type { NfeWriteTransaction } from '../../nfe-documents/types/nfe-write-transaction.types.js'
import type { AccessKeyLookupRecord } from '../application/process-access-key-lookup.types.js'
import { ACTIVE_LOOKUP_STATUSES } from '../domain/nfe-access-key-lookup.constant.js'

const lookups = nfeAccessKeyLookups

export function lookupKeyCondition(lookup: AccessKeyLookupRecord) {
  return and(eq(lookups.companyId, lookup.companyId), eq(lookups.id, lookup.id))
}

export async function markLookupImported(
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
    .where(and(lookupKeyCondition(input.lookup), inArray(lookups.status, ACTIVE_LOOKUP_STATUSES)))
}

export async function completeLookupImport(
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

export async function insertDuplicatedImportItem(
  tx: NfeWriteTransaction,
  input: {
    readonly accessKey: string
    readonly companyId: string
    readonly importId: string
    readonly sourceObjectId: string
    readonly sourceSha256: string
  },
): Promise<void> {
  await tx.insert(nfeImportItems).values({
    accessKey: input.accessKey,
    companyId: input.companyId,
    importId: input.importId,
    ordinal: 1n,
    sourceEntry: input.accessKey,
    sourceName: `${input.accessKey}.xml`,
    sourceObjectId: input.sourceObjectId,
    sourceSha256: input.sourceSha256,
    status: 'duplicated',
    variant: 'complete',
  })
}
