/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { createIdempotencyFingerprintService } from '../companies/application/idempotency-fingerprint.service.js'
import { createRequestNfeImportUseCase } from '../nfe-imports/application/request-nfe-import.use-case.js'
import { DrizzleNfeImportRepository } from '../nfe-imports/infrastructure/drizzle-nfe-import.repository.js'
import { DrizzleStoredObjectRepository } from '../storage/infrastructure/drizzle-stored-object.repository.js'
import {
  buildNfeImportSourceObjectKey,
  createNfeStorageGatewayFromEnvironment,
} from '../storage/infrastructure/nfe-storage-gateway.js'

/**
 * O lote existe pelo mesmo motivo do lote do navegador: a rota de upload tem teto de 1 MiB de corpo,
 * e o caminho da semente não passa por HTTP mas guarda o mesmo tamanho para o dado local ficar igual
 * ao que a tela produz — uma importação por lote, cada uma com a própria trilha.
 */
const BATCH_BYTES = 768 * 1024
const CONTENT_TYPE = 'application/xml'

export type SeedNfeDocumentsResult = {
  readonly batches: number
  readonly files: number
}

export type SeedNfeDocumentsParams = {
  readonly companyId: string
  readonly correlationId: string
  readonly database: Parameters<typeof buildSeedDependencies>[0]['database']
  readonly directory: string
  readonly environment: Record<string, string | undefined>
  readonly idempotencyHmacKey: Uint8Array
  readonly membershipId: string
  readonly userId: string
}

function buildSeedDependencies(input: {
  readonly database: ConstructorParameters<typeof DrizzleNfeImportRepository>[0]
  readonly environment: Record<string, string | undefined>
  readonly idempotencyHmacKey: Uint8Array
}) {
  const bucket = resolveStorageBucket(input.environment)

  return {
    bucket,
    requestImport: createRequestNfeImportUseCase({
      fingerprintService: createIdempotencyFingerprintService({ key: input.idempotencyHmacKey }),
      unitOfWork: new DrizzleNfeImportRepository(input.database),
    }),
    storageGateway: createNfeStorageGatewayFromEnvironment({
      environment: input.environment,
      finalBucket: bucket,
      stagingBucket: bucket,
    }),
    storedObjects: new DrizzleStoredObjectRepository(input.database),
  }
}

function resolveStorageBucket(environment: Record<string, string | undefined>): string {
  const bucket = environment.OBJECT_STORAGE_BUCKET ?? environment.STORAGE_BUCKET
  if (bucket === undefined || bucket.trim() === '') {
    throw new Error('Object storage bucket is required')
  }
  return bucket
}

function splitIntoBatches(
  files: readonly { readonly bytes: Uint8Array; readonly name: string }[],
): readonly (readonly { readonly bytes: Uint8Array; readonly name: string }[])[] {
  const batches: { readonly bytes: Uint8Array; readonly name: string }[][] = []
  let current: { readonly bytes: Uint8Array; readonly name: string }[] = []
  let currentBytes = 0

  for (const file of files) {
    if (current.length > 0 && currentBytes + file.bytes.byteLength > BATCH_BYTES) {
      batches.push(current)
      current = []
      currentBytes = 0
    }
    current.push(file)
    currentBytes += file.bytes.byteLength
  }
  if (current.length > 0) batches.push(current)

  return batches
}

export async function seedNfeDocuments(
  params: SeedNfeDocumentsParams,
): Promise<SeedNfeDocumentsResult> {
  const names = (await readdir(params.directory)).filter((name) => name.endsWith('.xml')).sort()
  if (names.length === 0) return { batches: 0, files: 0 }

  const files = await Promise.all(
    names.map(async (name) => ({
      bytes: new Uint8Array(await readFile(join(params.directory, name))),
      name,
    })),
  )

  const dependencies = buildSeedDependencies({
    database: params.database,
    environment: params.environment,
    idempotencyHmacKey: params.idempotencyHmacKey,
  })
  const batches = splitIntoBatches(files)

  for (const batch of batches) {
    const importId = crypto.randomUUID()
    const stagedSources = await Promise.all(
      batch.map(async (file, index) => {
        const objectId = crypto.randomUUID()
        const sha256 = createHash('sha256').update(file.bytes).digest('hex')
        const stored = await dependencies.storageGateway.storeObject({
          body: file.bytes,
          bucket: dependencies.bucket,
          contentLength: file.bytes.byteLength,
          contentType: CONTENT_TYPE,
          key: buildNfeImportSourceObjectKey({
            companyId: params.companyId,
            importId,
            objectId,
          }),
          sha256,
        })
        await dependencies.storedObjects.saveImportSource({
          bucket: stored.bucket,
          companyId: params.companyId,
          id: objectId,
          mimeType: stored.contentType,
          objectKey: stored.key,
          provider: stored.provider,
          sha256: stored.sha256,
          sizeBytes: BigInt(stored.contentLength),
        })
        return {
          contentLength: stored.contentLength,
          contentType: stored.contentType,
          objectId,
          sha256: stored.sha256,
          sourceEntry: index === 0 ? '/' : file.name,
          sourceName: file.name,
        }
      }),
    )

    await dependencies.requestImport.execute({
      context: {
        companyId: params.companyId,
        kind: 'company',
        membershipId: params.membershipId,
        permissions: new Set(['invoices.import'] as const),
        roles: ['company-admin'],
        userId: params.userId,
      },
      correlationId: params.correlationId,
      idempotencyKey: `local-nfe-seed-${importId}`,
      importId,
      source: 'upload',
      stagedSources,
    })
  }

  return { batches: batches.length, files: files.length }
}
