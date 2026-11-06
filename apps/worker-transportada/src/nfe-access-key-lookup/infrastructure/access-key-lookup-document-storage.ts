/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  OBJECT_STORAGE_ERROR_CODES,
  ObjectStorageError,
} from '@adatechnology/object-storage-provider'

import {
  buildDocumentKey,
  type NfeImportFinalStorage,
} from '../../nfe-imports/infrastructure/nfe-import-storage.gateway.js'
import type { AccessKeyLookupDocumentStoragePort } from '../application/process-access-key-lookup.types.js'

/**
 * O endereço do original é a chave da nota: objeto que já está no bucket é o mesmo XML (da
 * distribuição, ou de uma tentativa que subiu e não chegou a gravar a linha) e vira referência.
 */
export function createAccessKeyLookupDocumentStorage(input: {
  readonly bucket: string
  readonly finalStorage: NfeImportFinalStorage
}): AccessKeyLookupDocumentStoragePort {
  return {
    async storeDocument(params) {
      try {
        return await input.finalStorage.storeImportedDocument(params)
      } catch (error: unknown) {
        const isConflict =
          error instanceof ObjectStorageError &&
          error.code === OBJECT_STORAGE_ERROR_CODES.objectConflict
        if (!isConflict) throw error
        return {
          bucket: input.bucket,
          key: buildDocumentKey({ accessKey: params.accessKey, companyId: params.companyId }),
          objectId: crypto.randomUUID(),
          sha256: params.sourceSha256,
          sizeBytes: params.sourceBytes.byteLength,
        }
      }
    },
  }
}
