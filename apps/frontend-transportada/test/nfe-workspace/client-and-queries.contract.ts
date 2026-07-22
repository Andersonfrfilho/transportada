/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import {
  DOCUMENT_LIST_PAGE,
  IMPORT_LIST_PAGE,
  IMPORT_SUMMARY,
  SYNTHETIC_ACCESS_TOKEN,
  SYNTHETIC_CURSOR,
  SYNTHETIC_IDEMPOTENCY_KEY,
  loadFutureModule,
  syntheticXmlFile,
  syntheticZipFile,
} from './nfe-workspace.fixture'

describe('nfe workspace client and queries contract', () => {
  test('sends authenticated no-store requests for upload, distribution, reprocess and list/detail queries', async () => {
    const requests: Request[] = []
    const { createNfeWorkspaceClient } = await loadFutureModule<NfeWorkspaceClientModule>(
      '../../src/modules/nfe-workspace/shared/nfeWorkspaceClient.service',
    )
    const client = createNfeWorkspaceClient({
      apiUrl: 'https://api.example.test',
      fetch: async (input, init) => {
        const request = new Request(input, init)
        requests.push(request)
        return resolveSyntheticResponse(request)
      },
      getAccessToken: () => Promise.resolve(SYNTHETIC_ACCESS_TOKEN),
    })

    expect(
      await client.requestUpload({
        files: [syntheticXmlFile(), syntheticZipFile()],
        idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
      }),
    ).toEqual(IMPORT_SUMMARY)
    expect(await client.requestDistribution({ idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY })).toEqual(
      IMPORT_SUMMARY,
    )
    expect(
      await client.reprocessImport({
        id: IMPORT_SUMMARY.id,
        idempotencyKey: SYNTHETIC_IDEMPOTENCY_KEY,
      }),
    ).toEqual(IMPORT_SUMMARY)
    expect(await client.listImports({ cursor: SYNTHETIC_CURSOR, limit: 20 })).toEqual(
      IMPORT_LIST_PAGE,
    )
    expect(await client.getImportDetail({ id: IMPORT_SUMMARY.id })).toEqual(IMPORT_SUMMARY)
    expect(await client.listDocuments({ cursor: null, limit: 20 })).toEqual(DOCUMENT_LIST_PAGE)
    expect(await client.downloadDocumentXml({ id: DOCUMENT_LIST_PAGE.items[0].id })).toBeInstanceOf(
      Blob,
    )

    const [
      uploadRequest,
      distributionRequest,
      reprocessRequest,
      listImportsRequest,
      detailRequest,
      listDocumentsRequest,
      downloadXmlRequest,
    ] = requests
    if (
      uploadRequest === undefined ||
      distributionRequest === undefined ||
      reprocessRequest === undefined ||
      listImportsRequest === undefined ||
      detailRequest === undefined ||
      listDocumentsRequest === undefined ||
      downloadXmlRequest === undefined
    ) {
      throw new Error('NFE_WORKSPACE_CONTRACT_REQUEST_MISSING')
    }

    expect(uploadRequest.url).toBe('https://api.example.test/nfe-imports/xml')
    expect(uploadRequest.method).toBe('POST')
    expect(uploadRequest.headers.get('authorization')).toBe(`Bearer ${SYNTHETIC_ACCESS_TOKEN}`)
    expect(uploadRequest.headers.get('idempotency-key')).toBe(SYNTHETIC_IDEMPOTENCY_KEY)
    expect(uploadRequest.cache).toBe('no-store')
    const uploadFormData = await uploadRequest.formData()
    expect(uploadFormData.getAll('files')).toHaveLength(2)

    expect(distributionRequest.url).toBe('https://api.example.test/nfe-imports/distribution')
    expect(distributionRequest.method).toBe('POST')
    expect(distributionRequest.headers.get('idempotency-key')).toBe(SYNTHETIC_IDEMPOTENCY_KEY)
    expect(distributionRequest.cache).toBe('no-store')

    expect(reprocessRequest.url).toBe(
      `https://api.example.test/nfe-imports/${IMPORT_SUMMARY.id}/reprocess`,
    )
    expect(reprocessRequest.method).toBe('POST')
    expect(reprocessRequest.headers.get('idempotency-key')).toBe(SYNTHETIC_IDEMPOTENCY_KEY)
    expect(reprocessRequest.cache).toBe('no-store')

    expect(listImportsRequest.url).toBe(
      `https://api.example.test/nfe-imports?cursor=${encodeURIComponent(SYNTHETIC_CURSOR)}&limit=20`,
    )
    expect(listImportsRequest.method).toBe('GET')
    expect(listImportsRequest.cache).toBe('no-store')

    expect(detailRequest.url).toBe(`https://api.example.test/nfe-imports/${IMPORT_SUMMARY.id}`)
    expect(detailRequest.method).toBe('GET')
    expect(detailRequest.cache).toBe('no-store')

    expect(listDocumentsRequest.url).toBe('https://api.example.test/nfe-documents?limit=20')
    expect(listDocumentsRequest.method).toBe('GET')
    expect(listDocumentsRequest.cache).toBe('no-store')

    expect(downloadXmlRequest.url).toBe(
      `https://api.example.test/nfe-documents/${DOCUMENT_LIST_PAGE.items[0].id}/xml`,
    )
    expect(downloadXmlRequest.method).toBe('GET')
    expect(downloadXmlRequest.headers.get('accept')).toBe('application/xml')
    expect(downloadXmlRequest.cache).toBe('no-store')
  })
})

function resolveSyntheticResponse(request: Request): Promise<Response> {
  if (request.url.endsWith('/nfe-imports/xml')) {
    return Promise.resolve(Response.json(IMPORT_SUMMARY))
  }
  if (request.url.endsWith('/nfe-imports/distribution')) {
    return Promise.resolve(Response.json(IMPORT_SUMMARY))
  }
  if (request.url.endsWith(`/nfe-imports/${IMPORT_SUMMARY.id}/reprocess`)) {
    return Promise.resolve(Response.json(IMPORT_SUMMARY))
  }
  if (request.url.includes('/nfe-imports?')) {
    return Promise.resolve(Response.json(IMPORT_LIST_PAGE))
  }
  if (request.url.endsWith(`/nfe-imports/${IMPORT_SUMMARY.id}`)) {
    return Promise.resolve(Response.json(IMPORT_SUMMARY))
  }
  if (request.url.includes('/nfe-documents?')) {
    return Promise.resolve(Response.json(DOCUMENT_LIST_PAGE))
  }
  if (request.url.endsWith(`/nfe-documents/${DOCUMENT_LIST_PAGE.items[0].id}/xml`)) {
    return Promise.resolve(
      new Response('<nfeProc/>', {
        headers: { 'content-type': 'application/xml' },
      }),
    )
  }

  throw new Error(`Unexpected request in contract: ${request.url}`)
}

type NfeWorkspaceClient = {
  downloadDocumentXml(input: { readonly id: string }): Promise<Blob>
  getImportDetail(input: { readonly id: string }): Promise<unknown>
  listDocuments(input: { readonly cursor: null | string; readonly limit: number }): Promise<unknown>
  listImports(input: { readonly cursor: null | string; readonly limit: number }): Promise<unknown>
  reprocessImport(input: { readonly id: string; readonly idempotencyKey: string }): Promise<unknown>
  requestDistribution(input: { readonly idempotencyKey: string }): Promise<unknown>
  requestUpload(input: {
    readonly files: readonly File[]
    readonly idempotencyKey: string
  }): Promise<unknown>
}

type NfeWorkspaceClientModule = {
  readonly createNfeWorkspaceClient: (input: {
    readonly apiUrl: string
    readonly fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
    readonly getAccessToken: () => Promise<string>
  }) => NfeWorkspaceClient
}
