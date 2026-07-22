/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import type { ObjectStorageProvider, StoredObject } from '@adatechnology/object-storage-provider'
import { createObjectStorageProvider } from '@adatechnology/object-storage-provider'
import { z } from 'zod'

type NfeStorageObjectPurpose = 'import_source' | 'nfe_document' | 'nfe_event'

type PutInput = {
  readonly bucket: string
  readonly key: string
  readonly body: Uint8Array | ReadableStream<Uint8Array>
  readonly contentLength: number
  readonly contentType: string
  readonly sha256: string
}

type ObjectLocation = {
  readonly bucket: string
  readonly key: string
}

export type NfeStorageGateway = {
  readonly storeObject: (input: PutInput) => ReturnType<ObjectStorageProvider['put']>
  readonly storeImportSource: (
    input: {
      readonly companyId: string
      readonly importId: string
      readonly objectId: string
    } & Omit<PutInput, 'bucket' | 'key'>,
  ) => ReturnType<ObjectStorageProvider['put']>
  readonly storeFinalDocument: (
    input: {
      readonly companyId: string
      readonly documentId: string
      readonly objectId: string
    } & Omit<PutInput, 'bucket' | 'key'>,
  ) => ReturnType<ObjectStorageProvider['put']>
  readonly storeFinalEvent: (
    input: {
      readonly companyId: string
      readonly eventId: string
      readonly objectId: string
    } & Omit<PutInput, 'bucket' | 'key'>,
  ) => ReturnType<ObjectStorageProvider['put']>
  readonly getObjectStream: (input: ObjectLocation) => Promise<ReadableStream<Uint8Array>>
  readonly headObject: (input: ObjectLocation) => Promise<StoredObject | undefined>
  readonly health: () => Promise<{ readonly status: 'up' | 'down' }>
  readonly close: () => Promise<void>
}

export function buildNfeImportSourceObjectKey(input: {
  readonly companyId: string
  readonly importId: string
  readonly objectId: string
}): string {
  return `tenants/${input.companyId}/nfe-imports/${input.importId}/staging/${input.objectId}`
}

export function buildNfeDocumentObjectKey(input: {
  readonly companyId: string
  readonly documentId: string
  readonly objectId: string
}): string {
  return `tenants/${input.companyId}/nfe-documents/${input.documentId}/original/${input.objectId}`
}

export function buildNfeEventObjectKey(input: {
  readonly companyId: string
  readonly eventId: string
  readonly objectId: string
}): string {
  return `tenants/${input.companyId}/nfe-events/${input.eventId}/original/${input.objectId}`
}

export function createNfeStorageGateway(input: {
  readonly provider: ObjectStorageProvider
  readonly stagingBucket: string
  readonly finalBucket: string
}): NfeStorageGateway {
  const { provider, stagingBucket, finalBucket } = input

  return {
    async storeObject(storeInput) {
      return provider.put({
        body: storeInput.body,
        bucket: storeInput.bucket,
        contentLength: storeInput.contentLength,
        contentType: storeInput.contentType,
        key: storeInput.key,
        mode: 'create-only',
        sha256: storeInput.sha256,
      })
    },
    async storeImportSource(source) {
      return this.storeObject({
        body: source.body,
        bucket: stagingBucket,
        contentLength: source.contentLength,
        contentType: source.contentType,
        key: buildNfeImportSourceObjectKey({
          companyId: source.companyId,
          importId: source.importId,
          objectId: source.objectId,
        }),
        sha256: source.sha256,
      })
    },
    async storeFinalDocument(document) {
      return this.storeObject({
        body: document.body,
        bucket: finalBucket,
        contentLength: document.contentLength,
        contentType: document.contentType,
        key: buildNfeDocumentObjectKey({
          companyId: document.companyId,
          documentId: document.documentId,
          objectId: document.objectId,
        }),
        sha256: document.sha256,
      })
    },
    async storeFinalEvent(event) {
      return this.storeObject({
        body: event.body,
        bucket: finalBucket,
        contentLength: event.contentLength,
        contentType: event.contentType,
        key: buildNfeEventObjectKey({
          companyId: event.companyId,
          eventId: event.eventId,
          objectId: event.objectId,
        }),
        sha256: event.sha256,
      })
    },
    async getObjectStream(location) {
      return provider.get(location)
    },
    async headObject(location) {
      return provider.head(location)
    },
    health: provider.health,
    close: provider.close,
  }
}

const objectStorageConfigSchema = z
  .object({
    OBJECT_STORAGE_ENDPOINT: z.string().trim().min(1).optional(),
    OBJECT_STORAGE_REGION: z.string().trim().min(1).optional(),
    OBJECT_STORAGE_ACCESS_KEY: z.string().trim().min(1).optional(),
    OBJECT_STORAGE_SECRET_KEY: z.string().trim().min(1).optional(),
    OBJECT_STORAGE_BUCKET: z.string().trim().min(1).optional(),
    OBJECT_STORAGE_MAX_OBJECT_SIZE_BYTES: z.coerce
      .number()
      .int()
      .positive()
      .default(25 * 1024 * 1024),
    OBJECT_STORAGE_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((value) => value === 'true'),
    STORAGE_ENDPOINT: z.string().trim().min(1).optional(),
    STORAGE_REGION: z.string().trim().min(1).optional(),
    STORAGE_ACCESS_KEY: z.string().trim().min(1).optional(),
    STORAGE_SECRET_KEY: z.string().trim().min(1).optional(),
    STORAGE_BUCKET: z.string().trim().min(1).optional(),
    STORAGE_MAX_OBJECT_SIZE_BYTES: z.coerce.number().int().positive().optional(),
    STORAGE_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
  })
  .transform((environment) => {
    const endpoint = environment.OBJECT_STORAGE_ENDPOINT ?? environment.STORAGE_ENDPOINT
    const accessKeyId = environment.OBJECT_STORAGE_ACCESS_KEY ?? environment.STORAGE_ACCESS_KEY
    const secretAccessKey = environment.OBJECT_STORAGE_SECRET_KEY ?? environment.STORAGE_SECRET_KEY
    const healthCheckBucket = environment.OBJECT_STORAGE_BUCKET ?? environment.STORAGE_BUCKET

    if (!endpoint) {
      throw new Error('Object storage endpoint is required')
    }
    if (!accessKeyId || !secretAccessKey) {
      throw new Error('Object storage credentials are required')
    }
    if (!healthCheckBucket) {
      throw new Error('Object storage bucket is required')
    }

    return {
      endpoint: new URL(endpoint),
      region: environment.OBJECT_STORAGE_REGION ?? environment.STORAGE_REGION ?? 'us-east-1',
      accessKeyId,
      secretAccessKey,
      healthCheckBucket,
      maxObjectSizeBytes:
        environment.OBJECT_STORAGE_MAX_OBJECT_SIZE_BYTES ??
        environment.STORAGE_MAX_OBJECT_SIZE_BYTES ??
        25 * 1024 * 1024,
      forcePathStyle:
        environment.OBJECT_STORAGE_FORCE_PATH_STYLE ?? environment.STORAGE_FORCE_PATH_STYLE ?? true,
    }
  })

export function createNfeStorageGatewayFromEnvironment(input: {
  readonly provider?: ObjectStorageProvider
  readonly environment: Record<string, string | undefined>
  readonly stagingBucket: string
  readonly finalBucket: string
}): NfeStorageGateway {
  const provider =
    input.provider ??
    createObjectStorageProvider({
      ...objectStorageConfigSchema.parse(input.environment),
    })

  return createNfeStorageGateway({
    provider,
    stagingBucket: input.stagingBucket,
    finalBucket: input.finalBucket,
  })
}

export function createNfeStorageObjectId(input: { readonly seed: string }): string {
  const hash = createHash('sha256').update(input.seed).digest('hex')
  return `${hash.slice(0, 12)}-${hash.slice(12, 24)}`
}

export const NFE_STORAGE_OBJECT_PURPOSES: readonly NfeStorageObjectPurpose[] = [
  'import_source',
  'nfe_document',
  'nfe_event',
]
