/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  API_TOKEN,
  COMPANY_TAX_ID_DIGITS,
  MUNICIPAL_REGISTRATION_DIGITS,
  PROVIDER_DOCUMENT_ID,
  PROVIDER_ORIGIN,
  createNotaRpV3ClientFixture,
  documentBody,
  errorBody,
  jsonResponse,
  recordingFetch,
  type FetchCall,
  type NotaRpV3DocumentOutcomeShape,
} from './fixture.js'

const DOCUMENTS = [
  {
    bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]),
    contentType: 'application/pdf',
    kind: 'pdf',
  },
  {
    bytes: new TextEncoder().encode('<?xml version="1.0" encoding="UTF-8"?><NFSe/>'),
    contentType: 'application/xml',
    kind: 'xml',
  },
] as const

async function documentWith(input: {
  kind: 'pdf' | 'xml'
  respond: () => Response
}): Promise<{ calls: FetchCall[]; outcome: NotaRpV3DocumentOutcomeShape }> {
  const { calls, fetch } = recordingFetch(input.respond)
  const client = await createNotaRpV3ClientFixture({ fetch })
  const outcome = await client.fetchDocument({
    kind: input.kind,
    providerDocumentId: PROVIDER_DOCUMENT_ID,
  })
  return { calls, outcome }
}

describe('Nota RP v3 client — documentos', () => {
  for (const document of DOCUMENTS) {
    test(`${document.kind}: GET {origem}/api/v3/nota/${document.kind}?id_nota=N com os cabeçalhos da v3`, async () => {
      const { calls } = await documentWith({
        kind: document.kind,
        respond: () => documentBody(document.bytes),
      })

      const requested = new URL(calls[0]?.url ?? '')
      expect(calls[0]?.method).toBe('GET')
      expect(requested.origin).toBe(PROVIDER_ORIGIN)
      expect(requested.pathname).toBe(`/api/v3/nota/${document.kind}`)
      expect(requested.searchParams.get('id_nota')).toBe(PROVIDER_DOCUMENT_ID)
      expect(calls[0]?.headers['x-auth-user-token']).toBe(API_TOKEN)
      expect(calls[0]?.headers['x-auth-cnpj']).toBe(COMPANY_TAX_ID_DIGITS)
      expect(calls[0]?.headers['x-auth-im']).toBe(MUNICIPAL_REGISTRATION_DIGITS)
    })

    test(`${document.kind}: base64_file vira ok com os bytes decodificados`, async () => {
      const { outcome } = await documentWith({
        kind: document.kind,
        respond: () => documentBody(document.bytes),
      })

      expect(outcome.status).toBe('ok')
      expect(outcome.contentType).toBe(document.contentType)
      expect(Array.from(outcome.bytes ?? [])).toEqual(Array.from(document.bytes))
    })
  }

  // A assinatura de bytes de resolveNfseDocumentBytes continua decidindo se é documento.
  test('base64 que não é PDF não é arquivado: malformed_response', async () => {
    const { outcome } = await documentWith({
      kind: 'pdf',
      respond: () => documentBody(new TextEncoder().encode('<html>não é pdf</html>')),
    })

    expect(outcome).toEqual({ cause: 'malformed_response', status: 'error' })
  })

  test('success:false é rejected', async () => {
    const { outcome } = await documentWith({
      kind: 'xml',
      respond: () => jsonResponse({ message: 'Nota sem XML disponível', success: false }),
    })

    expect(outcome.status).toBe('rejected')
  })

  test('404 é error not_found', async () => {
    const { outcome } = await documentWith({
      kind: 'pdf',
      respond: () => errorBody({ message: 'Recurso não encontrado', status: 404 }),
    })

    expect(outcome).toEqual({ cause: 'not_found', status: 'error' })
  })

  test('5xx é error unexpected_status', async () => {
    const { outcome } = await documentWith({
      kind: 'xml',
      respond: () => errorBody({ message: 'Houve um erro inesperado', status: 500 }),
    })

    expect(outcome).toEqual({ cause: 'unexpected_status', status: 'error' })
  })
})
