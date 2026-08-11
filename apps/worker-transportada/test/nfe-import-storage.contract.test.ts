/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { describe, expect, test } from 'bun:test'
import {
  OBJECT_STORAGE_ERROR_CODES,
  ObjectStorageError,
} from '@adatechnology/object-storage-provider'

import {
  createNfeImportFinalStorage,
  createNfeImportSourceStorage,
} from '../src/nfe-imports/infrastructure/nfe-import-storage.gateway.js'

const COMPANY_ID = 'd2e95c9f-7c6d-4b3e-ae63-c4dcae9e5d3c'
const IMPORT_ID = 'worker-import-01'
const ACCESS_KEY = '35190730290856000160550010000000011000000010'
const STAGING_BUCKET = 'transportada-staging'
const FINAL_BUCKET = 'transportada-final'

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

type PutRecord = {
  readonly bucket: string
  readonly key: string
  readonly body: Uint8Array
  readonly sha256: string
  readonly mode: string
}

function createFakeGateway() {
  const objects = new Map<string, Uint8Array>()
  const puts: PutRecord[] = []

  return {
    objects,
    puts,
    async storeObject(input: {
      readonly bucket: string
      readonly key: string
      readonly body: Uint8Array | ReadableStream<Uint8Array>
      readonly contentLength: number
      readonly contentType: string
      readonly sha256: string
    }) {
      const body = input.body as Uint8Array
      const lookup = `${input.bucket}:${input.key}`
      const existing = objects.get(lookup)
      puts.push({
        body,
        bucket: input.bucket,
        key: input.key,
        mode: 'create-only',
        sha256: input.sha256,
      })
      if (existing === undefined) {
        objects.set(lookup, new Uint8Array(body))
        return {
          bucket: input.bucket,
          contentLength: input.contentLength,
          contentType: input.contentType,
          disposition: 'created' as const,
          key: input.key,
          provider: 's3' as const,
          sha256: input.sha256,
        }
      }
      if (sha256(existing) === input.sha256) {
        return {
          bucket: input.bucket,
          contentLength: input.contentLength,
          contentType: input.contentType,
          disposition: 'replayed' as const,
          key: input.key,
          provider: 's3' as const,
          sha256: input.sha256,
        }
      }
      throw new ObjectStorageError(
        OBJECT_STORAGE_ERROR_CODES.objectConflict,
        'Object already exists with different content',
      )
    },
    async getObjectStream(input: { readonly bucket: string; readonly key: string }) {
      const existing = objects.get(`${input.bucket}:${input.key}`)
      if (existing === undefined) {
        throw new Error('missing object')
      }
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(existing)
          controller.close()
        },
      })
    },
  }
}

describe('nfe import storage adapters contract', () => {
  test('readSource streams the staging bytes back from the staging bucket', async () => {
    const gateway = createFakeGateway()
    const bytes = new TextEncoder().encode('<NFe id="staging"/>')
    gateway.objects.set(`${STAGING_BUCKET}:staging/object-1`, bytes)

    const sourceStorage = createNfeImportSourceStorage({
      bucket: STAGING_BUCKET,
      gateway,
    })
    const read = await sourceStorage.readSource({ key: 'staging/object-1' })

    expect(new TextDecoder().decode(read)).toBe('<NFe id="staging"/>')
  })

  test('storeImportedDocument writes create-only to an immutable final key', async () => {
    const gateway = createFakeGateway()
    const bytes = new TextEncoder().encode('<NFe id="doc"/>')
    const finalStorage = createNfeImportFinalStorage({ bucket: FINAL_BUCKET, gateway })

    const stored = await finalStorage.storeImportedDocument({
      accessKey: ACCESS_KEY,
      companyId: COMPANY_ID,
      importId: IMPORT_ID,
      sourceBytes: bytes,
      sourceSha256: sha256(bytes),
    })

    expect(stored.bucket).toBe(FINAL_BUCKET)
    expect(stored.key).toBe(`tenants/${COMPANY_ID}/nfe-documents/${ACCESS_KEY}/original.xml`)
    expect(stored.sha256).toBe(sha256(bytes))
    expect(stored.sizeBytes).toBe(bytes.byteLength)
    expect(stored.objectId).toMatch(/^[0-9a-f-]{36}$/)
    expect(gateway.puts).toHaveLength(1)
    expect(gateway.puts[0]?.mode).toBe('create-only')
  })

  test('storeImportedDocument replays idempotently for identical bytes', async () => {
    const gateway = createFakeGateway()
    const bytes = new TextEncoder().encode('<NFe id="doc"/>')
    const finalStorage = createNfeImportFinalStorage({ bucket: FINAL_BUCKET, gateway })

    const first = await finalStorage.storeImportedDocument({
      accessKey: ACCESS_KEY,
      companyId: COMPANY_ID,
      importId: IMPORT_ID,
      sourceBytes: bytes,
      sourceSha256: sha256(bytes),
    })
    const second = await finalStorage.storeImportedDocument({
      accessKey: ACCESS_KEY,
      companyId: COMPANY_ID,
      importId: IMPORT_ID,
      sourceBytes: bytes,
      sourceSha256: sha256(bytes),
    })

    expect(first.key).toBe(second.key)
    expect(gateway.puts).toHaveLength(2)
    expect(gateway.objects.size).toBe(1)
  })

  test('storeImportedDocument reports a conflict when the immutable key holds different content', async () => {
    const gateway = createFakeGateway()
    const finalStorage = createNfeImportFinalStorage({ bucket: FINAL_BUCKET, gateway })
    const original = new TextEncoder().encode('<NFe id="doc"/>')
    await finalStorage.storeImportedDocument({
      accessKey: ACCESS_KEY,
      companyId: COMPANY_ID,
      importId: IMPORT_ID,
      sourceBytes: original,
      sourceSha256: sha256(original),
    })

    const tampered = new TextEncoder().encode('<NFe id="tampered"/>')
    await expect(
      finalStorage.storeImportedDocument({
        accessKey: ACCESS_KEY,
        companyId: COMPANY_ID,
        importId: IMPORT_ID,
        sourceBytes: tampered,
        sourceSha256: sha256(tampered),
      }),
    ).rejects.toThrow()
  })

  /**
   * O resumo e o XML completo da mesma chave disputavam `original.xml`. Bytes diferentes no mesmo
   * endereço viram conflito, e o conflito derrubava a página inteira da distribuição.
   */
  test('storeImportedSummary keeps the resumo out of the full document key', async () => {
    const gateway = createFakeGateway()
    const finalStorage = createNfeImportFinalStorage({ bucket: FINAL_BUCKET, gateway })
    const complete = new TextEncoder().encode('<nfeProc/>')
    const resumo = new TextEncoder().encode('<resNFe/>')

    const document = await finalStorage.storeImportedDocument({
      accessKey: ACCESS_KEY,
      companyId: COMPANY_ID,
      importId: IMPORT_ID,
      sourceBytes: complete,
      sourceSha256: sha256(complete),
    })
    const summary = await finalStorage.storeImportedSummary({
      accessKey: ACCESS_KEY,
      companyId: COMPANY_ID,
      importId: IMPORT_ID,
      nsu: '000000000037702',
      sourceBytes: resumo,
      sourceSha256: sha256(resumo),
    })

    expect(summary.key).toBe(
      `tenants/${COMPANY_ID}/nfe-summaries/${ACCESS_KEY}/000000000037702.xml`,
    )
    expect(summary.key).not.toBe(document.key)
    expect(gateway.objects.size).toBe(2)
  })

  /**
   * `resNFe` e `resEvento` da mesma chave são os dois "summary" e chegam em NSU diferentes — sem o
   * NSU no endereço, o segundo colidia com o primeiro.
   */
  test('storeImportedSummary gives each NSU of the same access key its own key', async () => {
    const gateway = createFakeGateway()
    const finalStorage = createNfeImportFinalStorage({ bucket: FINAL_BUCKET, gateway })
    const resumoNota = new TextEncoder().encode('<resNFe/>')
    const resumoEvento = new TextEncoder().encode('<resEvento/>')

    await finalStorage.storeImportedSummary({
      accessKey: ACCESS_KEY,
      companyId: COMPANY_ID,
      importId: IMPORT_ID,
      nsu: '000000000037702',
      sourceBytes: resumoNota,
      sourceSha256: sha256(resumoNota),
    })
    await finalStorage.storeImportedSummary({
      accessKey: ACCESS_KEY,
      companyId: COMPANY_ID,
      importId: IMPORT_ID,
      nsu: '000000000037703',
      sourceBytes: resumoEvento,
      sourceSha256: sha256(resumoEvento),
    })

    expect(gateway.objects.size).toBe(2)
  })

  test('storeImportedEvent writes to an immutable per-event final key', async () => {
    const gateway = createFakeGateway()
    const bytes = new TextEncoder().encode('<procEventoNFe/>')
    const finalStorage = createNfeImportFinalStorage({ bucket: FINAL_BUCKET, gateway })

    const stored = await finalStorage.storeImportedEvent({
      accessKey: ACCESS_KEY,
      companyId: COMPANY_ID,
      importId: IMPORT_ID,
      sequence: '1',
      sourceBytes: bytes,
      sourceSha256: sha256(bytes),
      type: '110111',
    })

    expect(stored.bucket).toBe(FINAL_BUCKET)
    expect(stored.key).toBe(`tenants/${COMPANY_ID}/nfe-events/${ACCESS_KEY}/110111-1.xml`)
    expect(stored.sha256).toBe(sha256(bytes))
    expect(stored.sizeBytes).toBe(bytes.byteLength)
  })
})
