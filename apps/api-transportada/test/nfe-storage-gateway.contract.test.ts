/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { describe, expect, test } from 'bun:test'
import { type StoredObject } from '@adatechnology/object-storage-provider'

import {
  buildNfeDocumentObjectKey,
  buildNfeImportSourceObjectKey,
  createNfeStorageGateway,
} from '../src/storage/infrastructure/nfe-storage-gateway.js'

const COMPANY_ID = '9f5fefde-4f7e-4ca9-bf3c-9f2b17d4f9fb'
const IMPORT_ID = 'import-001'
const DOCUMENT_ID = 'doc-001'
const BUCKET = 'transportada-private'
const XML_BYTES = new TextEncoder().encode('<NFe id="contract"/>')
const OTHER_BYTES = new TextEncoder().encode('<NFe id="other"/>')

type StoredObjectEntry = {
  readonly key: string
  readonly source: Uint8Array
  readonly contentType: string
}

type FakeObjectStorageProvider = {
  readonly data: Map<string, StoredObjectEntry>
  readonly signedDownloadInputs: Array<Record<string, unknown>>
  readonly putInputs: Array<{
    readonly bucket: string
    readonly key: string
    readonly contentLength: number
    readonly contentType: string
    readonly sha256: string
    readonly mode: 'create-only'
  }>
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
  get(input: { readonly bucket: string; readonly key: string }): Promise<ReadableStream<Uint8Array>>
  head(input: { readonly bucket: string; readonly key: string }): Promise<StoredObject | undefined>
  delete(input: { readonly bucket: string; readonly key: string }): Promise<void>
  createSignedDownload(input: {
    readonly bucket: string
    readonly key: string
    readonly expiresInSeconds: number
    readonly disposition?: 'inline' | 'attachment'
    readonly filename?: string
  }): Promise<URL>
  health(): Promise<{ readonly status: 'up' | 'down' }>
  close(): Promise<void>
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

function createFakeStorageProvider(): FakeObjectStorageProvider {
  const data = new Map<string, StoredObjectEntry>()
  const putInputs: FakeObjectStorageProvider['putInputs'] = []
  const signedDownloadInputs: FakeObjectStorageProvider['signedDownloadInputs'] = []

  return {
    data,
    putInputs,
    signedDownloadInputs,
    async put(input) {
      putInputs.push({
        bucket: input.bucket,
        key: input.key,
        contentLength: input.contentLength,
        contentType: input.contentType,
        sha256: input.sha256,
        mode: input.mode,
      })

      const lookupKey = `${input.bucket}:${input.key}`
      const existing = data.get(lookupKey)

      if (existing !== undefined) {
        if (sha256(existing.source) === input.sha256) {
          return {
            provider: 's3',
            bucket: input.bucket,
            key: input.key,
            contentLength: existing.source.byteLength,
            contentType: existing.contentType,
            sha256: input.sha256,
            disposition: 'replayed',
          }
        }
        throw new Error('object has different hash')
      }

      data.set(lookupKey, {
        key: input.key,
        source: new Uint8Array(input.body),
        contentType: input.contentType,
      })

      return {
        provider: 's3',
        bucket: input.bucket,
        key: input.key,
        contentLength: input.contentLength,
        contentType: input.contentType,
        sha256: input.sha256,
        disposition: 'created',
      }
    },
    async get(input) {
      const existing = data.get(`${input.bucket}:${input.key}`)
      if (existing === undefined) throw new Error('missing object')
      return new Blob([existing.source]).stream()
    },
    async head(input) {
      const existing = data.get(`${input.bucket}:${input.key}`)
      if (existing === undefined) return undefined
      return {
        provider: 's3',
        bucket: input.bucket,
        key: input.key,
        contentLength: existing.source.byteLength,
        contentType: existing.contentType,
        sha256: sha256(existing.source),
      }
    },
    async delete() {},
    async createSignedDownload(input) {
      signedDownloadInputs.push({ ...input })
      return new URL('https://example.test/download')
    },
    async health() {
      return { status: 'up' }
    },
    async close() {},
  }
}

async function readBytes(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

describe('api nfe storage gateway contract', () => {
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

  test('builds opaque tenant-safe keys for staging and final object flows', () => {
    const staging = buildNfeImportSourceObjectKey({
      companyId: COMPANY_ID,
      importId: IMPORT_ID,
      objectId: 'source-1',
    })
    const document = buildNfeDocumentObjectKey({
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      objectId: 'doc-xml-1',
    })

    expect(staging).toContain(`tenants/${COMPANY_ID}/nfe-imports/${IMPORT_ID}/staging/source-1`)
    expect(document).toContain(
      `tenants/${COMPANY_ID}/nfe-documents/${DOCUMENT_ID}/original/doc-xml-1`,
    )
    expect(staging).not.toContain('nota.xml')
    expect(document).not.toContain('document.xml')
  })

  test('adapts storage to immutable create-only and hash replay/conflict semantics', async () => {
    const provider = createFakeStorageProvider()
    const gateway = createNfeStorageGateway({
      provider,
      stagingBucket: BUCKET,
      finalBucket: BUCKET,
    })
    const objectKey = buildNfeImportSourceObjectKey({
      companyId: COMPANY_ID,
      importId: IMPORT_ID,
      objectId: 'source-1',
    })
    const objectFingerprint = sha256(XML_BYTES)

    const created = await gateway.storeObject({
      bucket: BUCKET,
      key: objectKey,
      contentLength: XML_BYTES.byteLength,
      contentType: 'application/xml',
      sha256: objectFingerprint,
      body: XML_BYTES,
    })
    const replayed = await gateway.storeObject({
      bucket: BUCKET,
      key: objectKey,
      contentLength: XML_BYTES.byteLength,
      contentType: 'application/xml',
      sha256: objectFingerprint,
      body: XML_BYTES,
    })

    expect(created.disposition).toBe('created')
    expect(replayed.disposition).toBe('replayed')
    expect(provider.putInputs.at(0)?.mode).toBe('create-only')
    expect(provider.putInputs.at(0)?.sha256).toBe(objectFingerprint)
    expect(created.sha256).toBe(objectFingerprint)

    await expect(
      gateway.storeObject({
        bucket: BUCKET,
        key: objectKey,
        contentLength: OTHER_BYTES.byteLength,
        contentType: 'application/xml',
        sha256: sha256(OTHER_BYTES),
        body: OTHER_BYTES,
      }),
    ).rejects.toBeDefined()
  })

  test('streams by key and preserves raw object bytes', async () => {
    const provider = createFakeStorageProvider()
    const gateway = createNfeStorageGateway({
      provider,
      stagingBucket: BUCKET,
      finalBucket: BUCKET,
    })
    const sourceKey = buildNfeImportSourceObjectKey({
      companyId: COMPANY_ID,
      importId: IMPORT_ID,
      objectId: 'stream-1',
    })
    const objectFingerprint = sha256(XML_BYTES)

    await gateway.storeObject({
      bucket: BUCKET,
      key: sourceKey,
      contentLength: XML_BYTES.byteLength,
      contentType: 'application/xml',
      sha256: objectFingerprint,
      body: XML_BYTES,
    })

    const stream = await gateway.getObjectStream({ bucket: BUCKET, key: sourceKey })
    expect(await readBytes(stream)).toEqual(XML_BYTES)
  })

  test('supports head metadata for reconciliation and validation', async () => {
    const provider = createFakeStorageProvider()
    const gateway = createNfeStorageGateway({
      provider,
      stagingBucket: BUCKET,
      finalBucket: BUCKET,
    })
    const sourceKey = buildNfeImportSourceObjectKey({
      companyId: COMPANY_ID,
      importId: IMPORT_ID,
      objectId: 'meta-1',
    })

    await gateway.storeObject({
      bucket: BUCKET,
      key: sourceKey,
      contentLength: XML_BYTES.byteLength,
      contentType: 'application/xml',
      sha256: sha256(XML_BYTES),
      body: XML_BYTES,
    })
    const head = await gateway.headObject({ bucket: BUCKET, key: sourceKey })

    expect(head).toMatchObject({
      provider: 's3',
      bucket: BUCKET,
      key: sourceKey,
      contentLength: XML_BYTES.byteLength,
      contentType: 'application/xml',
      sha256: sha256(XML_BYTES),
    } satisfies Partial<StoredObject>)
  })

  test('repassa disposição e nome de arquivo para a URL assinada', async () => {
    const provider = createFakeStorageProvider()
    const gateway = createNfeStorageGateway({
      provider,
      stagingBucket: BUCKET,
      finalBucket: BUCKET,
    })
    const objectKey = buildNfeDocumentObjectKey({
      companyId: COMPANY_ID,
      documentId: DOCUMENT_ID,
      objectId: 'signed-1',
    })

    await gateway.createSignedDownload({
      bucket: BUCKET,
      disposition: 'attachment',
      expiresInSeconds: 300,
      filename: 'documento.xml',
      key: objectKey,
    })
    await gateway.createSignedDownload({ bucket: BUCKET, expiresInSeconds: 300, key: objectKey })

    // A disposição entra na assinatura: quem emite a URL decide, o cliente não troca depois.
    expect(provider.signedDownloadInputs).toEqual([
      {
        bucket: BUCKET,
        disposition: 'attachment',
        expiresInSeconds: 300,
        filename: 'documento.xml',
        key: objectKey,
      },
      { bucket: BUCKET, expiresInSeconds: 300, key: objectKey },
    ])
  })
})
