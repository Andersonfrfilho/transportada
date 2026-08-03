/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { describe, expect, test } from 'bun:test'
import { type StoredObject } from '@adatechnology/object-storage-provider'

import {
  buildNfeImportSourceObjectKey,
  createNfeStorageGateway,
  createNfeStorageReconciler,
} from '../src/storage/infrastructure/nfe-storage-gateway.js'

const COMPANY_ID = 'd2e95c9f-7c6d-4b3e-ae63-c4dcae9e5d3c'
const IMPORT_ID = 'worker-import-01'
const BUCKET = 'transportada-private'
const XML_BYTES = new TextEncoder().encode('<NFe id="worker-contract"/>')

type StoredObjectEntry = {
  readonly key: string
  readonly source: Uint8Array
}

type FakeObjectStorageProvider = {
  readonly data: Map<string, StoredObjectEntry>
  readonly deletedKeys: string[]
  get(input: { readonly bucket: string; readonly key: string }): Promise<ReadableStream<Uint8Array>>
  head(input: { readonly bucket: string; readonly key: string }): Promise<StoredObject | undefined>
  put(input: {
    readonly bucket: string
    readonly key: string
    readonly body: Uint8Array
    readonly contentLength: number
    readonly contentType: string
    readonly sha256: string
    readonly mode: 'create-only'
  }): Promise<{
    readonly provider: 's3'
    readonly bucket: string
    readonly key: string
    readonly contentLength: number
    readonly contentType: string
    readonly sha256: string
    readonly disposition: 'created' | 'replayed'
  }>
  delete(input: { readonly bucket: string; readonly key: string }): Promise<void>
  createSignedDownload(input: {
    readonly bucket: string
    readonly key: string
    readonly expiresInSeconds: number
  }): Promise<URL>
  health(): Promise<{ readonly status: 'up' | 'down' }>
  close(): Promise<void>
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function createFakeStorageProvider(): FakeObjectStorageProvider {
  const data = new Map<string, StoredObjectEntry>()
  const deletedKeys: string[] = []

  return {
    data,
    deletedKeys,
    async put(input) {
      const lookupKey = `${input.bucket}:${input.key}`
      const existing = data.get(lookupKey)
      if (existing === undefined) {
        data.set(lookupKey, { key: input.key, source: new Uint8Array(input.body) })
        return {
          provider: 's3',
          bucket: input.bucket,
          key: input.key,
          contentLength: input.contentLength,
          contentType: input.contentType,
          sha256: input.sha256,
          disposition: 'created',
        }
      }
      if (
        existing.source.byteLength === input.contentLength &&
        sha256(existing.source) === input.sha256
      ) {
        return {
          provider: 's3',
          bucket: input.bucket,
          key: input.key,
          contentLength: input.contentLength,
          contentType: input.contentType,
          sha256: input.sha256,
          disposition: 'replayed',
        }
      }
      throw new Error('object with different content')
    },
    async get(input) {
      const existing = data.get(`${input.bucket}:${input.key}`)
      if (existing === undefined) throw new Error('missing object')
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(existing.source)
          controller.close()
        },
      })
    },
    async head(input) {
      const existing = data.get(`${input.bucket}:${input.key}`)
      if (existing === undefined) return undefined
      return {
        provider: 's3',
        bucket: input.bucket,
        key: input.key,
        contentLength: existing.source.byteLength,
        contentType: 'application/xml',
        sha256: sha256(existing.source),
      }
    },
    async delete(input) {
      deletedKeys.push(`${input.bucket}:${input.key}`)
      data.delete(`${input.bucket}:${input.key}`)
    },
    async createSignedDownload() {
      return new URL('https://example.test/download')
    },
    async health() {
      return { status: 'up' }
    },
    async close() {},
  }
}

describe('worker nfe storage gateway contract', () => {
  test('pins storage package exactly', async () => {
    const packageManifest = (await Bun.file(
      new URL('../package.json', import.meta.url),
    ).json()) as {
      readonly dependencies?: Readonly<Record<string, string>>
    }
    expect(packageManifest.dependencies?.['@adatechnology/object-storage-provider']).toBe(
      '0.2.0-rc.0',
    )
  })

  test('streams and keys must follow tenant-safe opaque format', async () => {
    const provider = createFakeStorageProvider()
    const gateway = createNfeStorageGateway({
      provider,
      stagingBucket: BUCKET,
      finalBucket: BUCKET,
    })
    const stagingKey = buildNfeImportSourceObjectKey({
      companyId: COMPANY_ID,
      importId: IMPORT_ID,
      objectId: 'stream-worker',
    })

    const object = await gateway.storeObject({
      bucket: BUCKET,
      key: stagingKey,
      body: XML_BYTES,
      contentLength: XML_BYTES.byteLength,
      contentType: 'application/xml',
      sha256: sha256(XML_BYTES),
    })
    expect(object.key).toBe(stagingKey)
    expect(stagingKey).toContain(
      `tenants/${COMPANY_ID}/nfe-imports/${IMPORT_ID}/staging/stream-worker`,
    )
    expect(stagingKey).not.toContain('worker.xml')

    const head = await gateway.headObject({ bucket: BUCKET, key: stagingKey })
    expect(head).toMatchObject({
      provider: 's3',
      bucket: BUCKET,
      key: stagingKey,
      contentLength: XML_BYTES.byteLength,
      contentType: 'application/xml',
      sha256: sha256(XML_BYTES),
    } satisfies Partial<StoredObject>)
    const stream = await gateway.getObjectStream({ bucket: BUCKET, key: stagingKey })
    expect(await new Response(stream).arrayBuffer()).toBeDefined()
  })

  test('reconciler must never delete final objects while cleaning expired staging', async () => {
    const provider = createFakeStorageProvider()
    const reconciler = createNfeStorageReconciler({
      storageGateway: {
        async headObject(input) {
          return provider.head(input)
        },
        async deleteObject(input) {
          return provider.delete(input)
        },
      },
      storageRecordRepository: {
        async listExpiredStagingObjects() {
          return [
            {
              bucket: BUCKET,
              key: buildNfeImportSourceObjectKey({
                companyId: COMPANY_ID,
                importId: IMPORT_ID,
                objectId: 'expired-staging',
              }),
              companyId: COMPANY_ID,
              status: 'staging' as const,
            },
            {
              bucket: BUCKET,
              key: `tenants/${COMPANY_ID}/nfe-documents/doc-final/original/final.xml`,
              companyId: COMPANY_ID,
              status: 'final' as const,
            },
          ]
        },
        async markExpiredReconciled() {
          return
        },
      },
    })

    await reconciler.reconcileExpired()

    expect(provider.deletedKeys).toHaveLength(1)
    expect(provider.deletedKeys[0]).toContain('expired-staging')
    expect(provider.deletedKeys[0]).not.toContain('final.xml')
  })
})
