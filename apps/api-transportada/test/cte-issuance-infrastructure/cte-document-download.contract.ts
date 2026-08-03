/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import { createCteDocumentDownloadGateway } from '../../src/cte-issuance/infrastructure/cte-document-download.gateway.js'

const BUCKET = 'fiscal-documents-test'
const NOW = new Date('2026-07-30T12:00:00.000Z')

/** Chave sintética: 44 dígitos derivados de um sequencial, nunca uma chave fiscal real. */
const ACCESS_KEY = `${'0'.repeat(40)}0001`
const OBJECT_KEY = `tenants/company-1/cte-documents/${ACCESS_KEY}/authorized.xml`

type SignedDownloadRequest = {
  readonly bucket: string
  readonly key: string
  readonly expiresInSeconds: number
  readonly disposition?: 'inline' | 'attachment'
  readonly filename?: string
}

function createStorageStub(): {
  readonly requests: readonly SignedDownloadRequest[]
  readonly createSignedDownload: (input: SignedDownloadRequest) => Promise<URL>
} {
  const requests: SignedDownloadRequest[] = []

  return {
    async createSignedDownload(input) {
      requests.push(input)
      return new URL(`https://storage.test/${input.key}?signature=stub`)
    },
    requests,
  }
}

describe('CT-e document download gateway contract', () => {
  test('pede a URL assinada com anexo e nome de arquivo pela chave de acesso', async () => {
    const storage = createStorageStub()
    const gateway = createCteDocumentDownloadGateway({ now: () => NOW, storage })

    const download = await gateway.createDownloadUrl({
      bucket: BUCKET,
      fileName: `${ACCESS_KEY}.xml`,
      key: OBJECT_KEY,
    })

    // Sem `attachment` assinado o navegador renderiza o XML na aba em vez de baixar.
    expect(storage.requests).toEqual([
      {
        bucket: BUCKET,
        disposition: 'attachment',
        expiresInSeconds: 300,
        filename: `${ACCESS_KEY}.xml`,
        key: OBJECT_KEY,
      },
    ])
    expect(download).toEqual({
      expiresAt: '2026-07-30T12:05:00.000Z',
      url: `https://storage.test/${OBJECT_KEY}?signature=stub`,
    })
  })

  test('respeita a validade configurada e mantém a URL de vida curta', async () => {
    const storage = createStorageStub()
    const gateway = createCteDocumentDownloadGateway({
      expiresInSeconds: 60,
      now: () => NOW,
      storage,
    })

    const download = await gateway.createDownloadUrl({
      bucket: BUCKET,
      fileName: `${ACCESS_KEY}.xml`,
      key: OBJECT_KEY,
    })

    expect(storage.requests[0]?.expiresInSeconds).toBe(60)
    expect(download.expiresAt).toBe('2026-07-30T12:01:00.000Z')
  })
})
