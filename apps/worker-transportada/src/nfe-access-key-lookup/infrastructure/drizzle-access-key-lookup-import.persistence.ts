/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { and, eq } from 'drizzle-orm'

import { nfeDocuments, nfeImportItems, storedObjects } from '../../database/nfe.schema.js'
import { resolveNfeEventOrigin } from '../../nfe-documents/domain/nfe-event-origin.policy.js'
import { lockAccessKey } from '../../nfe-documents/infrastructure/drizzle-nfe-document-status.persistence.js'
import { insertNfeDocument } from '../../nfe-documents/infrastructure/nfe-document-insert.persistence.js'
import type { NfeDocumentStatusLogger } from '../../nfe-documents/types/nfe-document-status.types.js'
import type { NfeWriteTransaction } from '../../nfe-documents/types/nfe-write-transaction.types.js'
import type {
  AccessKeyLookupRepositoryPort,
  AccessKeyLookupStoredObject,
} from '../application/process-access-key-lookup.types.js'
import {
  NFE_ACCESS_KEY_LOOKUP_ERROR_CODE,
  NfeAccessKeyLookupError,
  NfeAccessKeyLookupNonRetryableError,
} from '../domain/nfe-access-key-lookup.error.js'
import {
  completeLookupImport,
  markLookupImported,
} from './drizzle-access-key-lookup-statements.persistence.js'

const XML_MIME_TYPE = 'application/xml'
const ACCESS_KEY_SOURCE = 'access_key' as const

type ImportDocumentInput = Parameters<AccessKeyLookupRepositoryPort['importDocument']>[0]

/** O objeto pode já ter linha (a distribuição grava o mesmo endereço): vale o id que existe, se for o mesmo conteúdo. */
async function resolveStoredObjectId(
  tx: NfeWriteTransaction,
  params: {
    readonly companyId: string
    readonly object: AccessKeyLookupStoredObject
    readonly storageProvider: string
  },
): Promise<string> {
  const { companyId, object, storageProvider } = params
  await tx
    .insert(storedObjects)
    .values({
      bucket: object.bucket,
      companyId,
      id: object.objectId,
      mimeType: XML_MIME_TYPE,
      objectKey: object.key,
      provider: storageProvider,
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
    .select({ id: storedObjects.id, sha256: storedObjects.sha256 })
    .from(storedObjects)
    .where(
      and(
        eq(storedObjects.companyId, companyId),
        eq(storedObjects.provider, storageProvider),
        eq(storedObjects.bucket, object.bucket),
        eq(storedObjects.objectKey, object.key),
      ),
    )
    .limit(1)
  if (row === undefined) {
    throw new NfeAccessKeyLookupError(NFE_ACCESS_KEY_LOOKUP_ERROR_CODE.STORED_OBJECT_MISSING)
  }
  if (row.sha256 !== object.sha256) {
    throw new NfeAccessKeyLookupNonRetryableError(
      NFE_ACCESS_KEY_LOOKUP_ERROR_CODE.STORAGE_SHA_CONFLICT,
    )
  }
  return row.id
}

async function findExistingDocumentId(
  tx: NfeWriteTransaction,
  params: { readonly accessKey: string; readonly companyId: string },
): Promise<string> {
  const [row] = await tx
    .select({ id: nfeDocuments.id })
    .from(nfeDocuments)
    .where(
      and(
        eq(nfeDocuments.companyId, params.companyId),
        eq(nfeDocuments.accessKey, params.accessKey),
      ),
    )
    .limit(1)
  if (row === undefined) {
    throw new NfeAccessKeyLookupError(NFE_ACCESS_KEY_LOOKUP_ERROR_CODE.DOCUMENT_MISSING)
  }
  return row.id
}

/** `undefined` quando a nota já existia (a distribuição chegou primeiro). */
async function insertLookupDocument(
  tx: NfeWriteTransaction,
  params: ImportDocumentInput & {
    readonly importId: string
    readonly logger: NfeDocumentStatusLogger
    readonly objectId: string
  },
): Promise<string | undefined> {
  const { lookup, prepared } = params
  if (prepared.normalizedXml.kind === 'nfe-event') {
    throw new NfeAccessKeyLookupNonRetryableError(NFE_ACCESS_KEY_LOOKUP_ERROR_CODE.NOT_A_DOCUMENT)
  }
  const created = await insertNfeDocument({
    companyId: lookup.companyId,
    createdByUserId: lookup.requestedByUserId,
    document: prepared.normalizedXml.document,
    importId: params.importId,
    logger: params.logger,
    provenance: resolveNfeEventOrigin({
      importId: params.importId,
      requestedByUserId: lookup.requestedByUserId,
      source: ACCESS_KEY_SOURCE,
    }),
    source: ACCESS_KEY_SOURCE,
    tx,
    xmlObjectId: params.objectId,
    xmlSha256: prepared.sourceSha256,
  })
  return created?.id
}

export async function importAccessKeyDocument(
  tx: NfeWriteTransaction,
  params: ImportDocumentInput & {
    readonly logger: NfeDocumentStatusLogger
    readonly storageProvider: string
  },
): Promise<{ readonly documentId: string; readonly isDuplicate: boolean }> {
  const { lookup, prepared } = params
  const { importId } = lookup
  if (importId === null) {
    throw new NfeAccessKeyLookupNonRetryableError(NFE_ACCESS_KEY_LOOKUP_ERROR_CODE.IMPORT_MISSING)
  }

  await lockAccessKey({ accessKey: lookup.accessKey, companyId: lookup.companyId, tx })
  const objectId = await resolveStoredObjectId(tx, {
    companyId: lookup.companyId,
    object: params.storedObject,
    storageProvider: params.storageProvider,
  })
  const created = await insertLookupDocument(tx, { ...params, importId, objectId })
  const documentId =
    created ??
    (await findExistingDocumentId(tx, {
      accessKey: lookup.accessKey,
      companyId: lookup.companyId,
    }))
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
  await markLookupImported(tx, { cStat: params.cStat, documentId, lookup, now: params.now })
  await completeLookupImport(tx, { isDuplicate, lookup, now: params.now })
  return { documentId, isDuplicate }
}
