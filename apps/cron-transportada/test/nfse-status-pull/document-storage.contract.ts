/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import { describe, expect, test } from 'bun:test'

import { createNfseFiscalDocumentStorage } from '../../src/nfse-status-pull/infrastructure/nfse-fiscal-document-storage.gateway.js'

const COMPANY_ID = '00000000-0000-4000-8000-0000000000c1'
const PROVIDER_DOCUMENT_ID = '900123456'
const BUCKET = 'transportada-local'
const XML_BYTES = new Uint8Array(Buffer.from('<CompNfse><Nfse/></CompNfse>', 'utf8'))
const PDF_BYTES = new Uint8Array(Buffer.from('%PDF-1.7 synthetic', 'utf8'))

type PutCall = Record<string, unknown>

function createProvider(): {
  readonly calls: PutCall[]
  readonly put: (input: Record<string, unknown>) => Promise<unknown>
} {
  const calls: PutCall[] = []
  return {
    calls,
    put: (input) => {
      const { body, ...rest } = input
      calls.push({ ...rest, bodyLength: (body as Uint8Array).byteLength })
      return Promise.resolve({})
    },
  }
}

describe('NFS-e fiscal document storage', () => {
  test('stores the authorized XML under the tenant prefix keyed by the provider document', async () => {
    const provider = createProvider()
    const storage = createNfseFiscalDocumentStorage({ bucket: BUCKET, provider })

    const stored = await storage.store({
      bytes: XML_BYTES,
      companyId: COMPANY_ID,
      kind: 'xml',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    const key = `tenants/${COMPANY_ID}/nfse-documents/${PROVIDER_DOCUMENT_ID}/authorized.xml`
    const sha256 = createHash('sha256').update(XML_BYTES).digest('hex')
    expect(provider.calls).toEqual([
      {
        bodyLength: XML_BYTES.byteLength,
        bucket: BUCKET,
        contentLength: XML_BYTES.byteLength,
        contentType: 'application/xml',
        key,
        mode: 'create-only',
        sha256,
      },
    ])
    expect(stored).toMatchObject({ bucket: BUCKET, key, sha256, sizeBytes: XML_BYTES.byteLength })
    expect(stored.objectId).toMatch(/^[0-9a-f-]{36}$/u)
  })

  /** `application/pdf` é caminho novo: nenhum outro trilho fiscal arquiva PDF. */
  test('stores the PDF beside the XML with its own media type', async () => {
    const provider = createProvider()
    const storage = createNfseFiscalDocumentStorage({ bucket: BUCKET, provider })

    const stored = await storage.store({
      bytes: PDF_BYTES,
      companyId: COMPANY_ID,
      kind: 'pdf',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(provider.calls[0]).toMatchObject({
      contentType: 'application/pdf',
      key: `tenants/${COMPANY_ID}/nfse-documents/${PROVIDER_DOCUMENT_ID}/nota.pdf`,
      mode: 'create-only',
    })
    expect(stored.sha256).toBe(createHash('sha256').update(PDF_BYTES).digest('hex'))
  })

  /** Chave por empresa: dois tenants nunca se sobrepõem, nem por acidente de id do provedor. */
  test('keeps every object under the tenant prefix', async () => {
    const provider = createProvider()
    const storage = createNfseFiscalDocumentStorage({ bucket: BUCKET, provider })

    await storage.store({
      bytes: XML_BYTES,
      companyId: COMPANY_ID,
      kind: 'xml',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(String(provider.calls[0]?.['key'])).toStartWith(`tenants/${COMPANY_ID}/`)
  })

  /**
   * `create-only` é o que torna o arquivamento repetível: reprocessar a mesma nota não sobrescreve
   * o documento fiscal já gravado — o provedor recusa, e a reconciliação segue idempotente.
   */
  test('always writes in create-only mode', async () => {
    const provider = createProvider()
    const storage = createNfseFiscalDocumentStorage({ bucket: BUCKET, provider })

    await storage.store({
      bytes: PDF_BYTES,
      companyId: COMPANY_ID,
      kind: 'pdf',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })
    await storage.store({
      bytes: XML_BYTES,
      companyId: COMPANY_ID,
      kind: 'xml',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(provider.calls.map((call) => call['mode'])).toEqual(['create-only', 'create-only'])
  })
})
