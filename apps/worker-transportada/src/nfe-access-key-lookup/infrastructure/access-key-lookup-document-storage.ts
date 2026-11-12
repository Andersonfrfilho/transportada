/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import {
  OBJECT_STORAGE_ERROR_CODES,
  ObjectStorageError,
} from '@adatechnology/object-storage-provider'

import {
  buildDocumentKey,
  type NfeImportFinalStorage,
} from '../../nfe-imports/infrastructure/nfe-import-storage.gateway.js'
import type { NfeStorageGateway } from '../../storage/infrastructure/nfe-storage-gateway.js'
import type { AccessKeyLookupDocumentStoragePort } from '../application/process-access-key-lookup.types.js'
import {
  NFE_ACCESS_KEY_LOOKUP_ERROR_CODE,
  NfeAccessKeyLookupNonRetryableError,
} from '../domain/nfe-access-key-lookup.error.js'

async function readSha256(input: {
  readonly bucket: string
  readonly gateway: Pick<NfeStorageGateway, 'getObjectStream'>
  readonly key: string
}): Promise<string> {
  const stream = await input.gateway.getObjectStream({ bucket: input.bucket, key: input.key })
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * O endereço do original é a chave da nota: objeto que já está no bucket é o mesmo XML (da
 * distribuição, ou de uma tentativa que subiu e não chegou a gravar a linha) e vira referência.
 * Conteúdo diferente no mesmo endereço não é o mesmo XML: não se reaproveita.
 */
export function createAccessKeyLookupDocumentStorage(input: {
  readonly bucket: string
  readonly finalStorage: NfeImportFinalStorage
  readonly gateway: Pick<NfeStorageGateway, 'getObjectStream'>
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

        const key = buildDocumentKey({ accessKey: params.accessKey, companyId: params.companyId })
        const existingSha256 = await readSha256({
          bucket: input.bucket,
          gateway: input.gateway,
          key,
        })
        if (existingSha256 !== params.sourceSha256) {
          throw new NfeAccessKeyLookupNonRetryableError(
            NFE_ACCESS_KEY_LOOKUP_ERROR_CODE.STORAGE_SHA_CONFLICT,
          )
        }
        return {
          bucket: input.bucket,
          key,
          objectId: crypto.randomUUID(),
          sha256: params.sourceSha256,
          sizeBytes: params.sourceBytes.byteLength,
        }
      }
    },
  }
}
