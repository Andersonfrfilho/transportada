/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Adapta o `NfeStorageGateway` (bucket do ambiente, o mesmo de importação/documentos fiscais —
 * spec 154 D3 não pede bucket próprio) ao `TollBoothExtractStoragePort`, mapeando o conflito de
 * `create-only` do provider para o erro de domínio do módulo (code-standart §7: nunca erro cru).
 */
import {
  OBJECT_STORAGE_ERROR_CODES,
  ObjectStorageError,
} from '@adatechnology/object-storage-provider'

import type { NfeStorageGateway } from '../../storage/infrastructure/nfe-storage-gateway.js'
import { TollBoothExtractObjectConflictError } from '../domain/toll-booth-extract.error.js'
import type {
  PutExtractObjectInput,
  PutExtractObjectResult,
  TollBoothExtractStoragePort,
} from '../application/toll-booth-extract.port.js'

const EXTRACT_CONTENT_TYPE = 'application/json'

export function createTollBoothExtractStorageGateway(dependencies: {
  readonly bucket: string
  readonly storage: NfeStorageGateway
}): TollBoothExtractStoragePort {
  return {
    async putCreateOnly(input: PutExtractObjectInput): Promise<PutExtractObjectResult> {
      try {
        const stored = await dependencies.storage.storeObject({
          body: input.body,
          bucket: dependencies.bucket,
          contentLength: input.contentLength,
          contentType: EXTRACT_CONTENT_TYPE,
          key: input.key,
          sha256: input.sha256,
        })
        return { disposition: stored.disposition }
      } catch (error) {
        if (
          error instanceof ObjectStorageError &&
          error.code === OBJECT_STORAGE_ERROR_CODES.objectConflict
        ) {
          throw new TollBoothExtractObjectConflictError()
        }
        throw error
      }
    },
  }
}
