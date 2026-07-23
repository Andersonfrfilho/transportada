/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ObjectStorageProvider, StoredObject } from '@adatechnology/object-storage-provider'
import { createObjectStorageProvider } from '@adatechnology/object-storage-provider'
import { z } from 'zod'

type NfeStorageStatus = 'staging' | 'final' | 'deleted'

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

export type NfeStorageRecord = {
  readonly companyId: string
  readonly bucket: string
  readonly key: string
  readonly status: NfeStorageStatus
}

export type NfeStorageGateway = {
  readonly storeObject: (input: PutInput) => ReturnType<ObjectStorageProvider['put']>
  readonly getObjectStream: (input: ObjectLocation) => Promise<ReadableStream<Uint8Array>>
  readonly healthCheck: () => Promise<{ readonly healthy: true }>
  readonly headObject: (input: ObjectLocation) => Promise<StoredObject | undefined>
  readonly deleteObject: (input: ObjectLocation) => Promise<void>
  readonly close: () => Promise<void>
}

export type NfeStorageRecordRepositoryPort = {
  readonly listExpiredStagingObjects: () => Promise<readonly NfeStorageRecord[]>
  readonly markExpiredReconciled: (input: {
    readonly companyId: string
    readonly bucket: string
    readonly key: string
  }) => Promise<void>
}

export type NfeStorageReconcilableGateway = Pick<NfeStorageGateway, 'headObject' | 'deleteObject'>

export function buildNfeImportSourceObjectKey(input: {
  readonly companyId: string
  readonly importId: string
  readonly objectId: string
}): string {
  return `tenants/${input.companyId}/nfe-imports/${input.importId}/staging/${input.objectId}`
}

type NfeStorageGatewayInput = {
  readonly provider: ObjectStorageProvider
  readonly stagingBucket?: string
  readonly finalBucket?: string
}

export function createNfeStorageGateway({
  provider,
  stagingBucket,
  finalBucket,
}: NfeStorageGatewayInput): NfeStorageGateway {
  void stagingBucket
  void finalBucket

  return {
    async storeObject(input) {
      return provider.put({
        body: input.body,
        bucket: input.bucket,
        contentLength: input.contentLength,
        contentType: input.contentType,
        key: input.key,
        mode: 'create-only',
        sha256: input.sha256,
      })
    },
    async getObjectStream(input) {
      return provider.get(input)
    },
    async healthCheck() {
      const health = await provider.health()
      if (health.status !== 'up') {
        throw new Error('Object storage is unavailable')
      }
      return { healthy: true as const }
    },
    async headObject(input) {
      return provider.head(input)
    },
    async deleteObject(input) {
      return provider.delete(input)
    },
    close: provider.close,
  }
}

export function createNfeStorageReconciler(input: {
  readonly storageGateway: NfeStorageReconcilableGateway
  readonly storageRecordRepository: NfeStorageRecordRepositoryPort
}): {
  reconcileExpired: () => Promise<void>
} {
  return {
    async reconcileExpired(): Promise<void> {
      const records = await input.storageRecordRepository.listExpiredStagingObjects()
      for (const record of records) {
        if (record.status !== 'staging') {
          continue
        }

        await input.storageGateway.headObject({
          bucket: record.bucket,
          key: record.key,
        })
        await input.storageGateway.deleteObject({
          bucket: record.bucket,
          key: record.key,
        })

        await input.storageRecordRepository.markExpiredReconciled({
          companyId: record.companyId,
          bucket: record.bucket,
          key: record.key,
        })
      }
    },
  }
}

const objectStorageConfigSchema = z
  .object({
    OBJECT_STORAGE_ENDPOINT: z.string().trim().min(1).optional(),
    OBJECT_STORAGE_REGION: z.string().trim().min(1).optional(),
    OBJECT_STORAGE_ACCESS_KEY: z.string().trim().min(1).optional(),
    OBJECT_STORAGE_SECRET_KEY: z.string().trim().min(1).optional(),
    OBJECT_STORAGE_BUCKET: z.string().trim().min(1).optional(),
    OBJECT_STORAGE_MAX_OBJECT_SIZE_BYTES: z.coerce.number().int().positive().optional(),
    OBJECT_STORAGE_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
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

    if (!endpoint || !accessKeyId || !secretAccessKey || !healthCheckBucket) {
      throw new Error('Object storage configuration is incomplete')
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
    createObjectStorageProvider(objectStorageConfigSchema.parse(input.environment))

  return createNfeStorageGateway({ provider })
}
