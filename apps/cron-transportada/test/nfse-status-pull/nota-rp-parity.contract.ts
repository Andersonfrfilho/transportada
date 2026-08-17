/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  API_TOKEN,
  authorizedData,
  binaryResponse,
  cancelledData,
  createNotaRpStatusClientFixture,
  failureBody,
  jsonResponse,
  NOTA_RP_CAUSES,
  pendingData,
  PROVIDER_DOCUMENT_ID,
  recordingFetch,
  rejectedData,
  successBody,
  throwingFetch,
  MUNICIPAL_REGISTRATION,
} from './fixture.js'

/**
 * O cliente do cron é cópia reduzida do cliente do worker — só consulta e download. A paridade que
 * importa é de **leitura**: a mesma resposta de fio tem de virar a mesma decisão nos dois lados.
 * Por isso os títulos abaixo nomeiam o gêmeo, no molde de `eligibility-reasons.contract.ts`, e
 * nenhum teste compara arquivo com arquivo: a cópia é reduzida de propósito.
 */

const XML_BYTES = new Uint8Array([0x3c, 0x6e, 0x66, 0x73, 0x65, 0x3e])
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])
/** Marcador dos dois clientes para "recusa veio sem código" — cópia por valor, como o resto. */
const UNKNOWN_REJECTION_CODE = 'NOTA_RP_UNKNOWN'

describe('Nota RP v2 status client parity', () => {
  test('reads "processando" as pending, matching the worker client table', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() => successBody(pendingData())).fetch,
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({ status: 'pending' })
  })

  test('reads "autorizada" as an archivable document, matching the worker client table', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() => successBody(authorizedData())).fetch,
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({
      document: {
        authorizedAt: '2026-08-12T13:45:00.000Z',
        fiscalNumber: '4321',
        providerDocumentId: PROVIDER_DOCUMENT_ID,
        verificationCode: 'VER-0001',
      },
      status: 'authorized',
    })
  })

  test('refuses an authorization without number or verification code, matching the worker client table', async () => {
    const incomplete = Object.fromEntries(
      Object.entries(authorizedData()).filter(([field]) => field !== 'numero_nota'),
    )
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() => successBody(incomplete)).fetch,
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({ cause: 'malformed_response', status: 'error' })
  })

  test('reads "rejeitada" as a rejection with code and message, matching the worker client table', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() => successBody(rejectedData())).fetch,
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({
      rejection: {
        code: 'E320',
        message: 'Item da lista de servicos incompativel com o CNAE informado',
      },
      status: 'rejected',
    })
  })

  test('reads "cancelada" with its timestamp, matching the worker client table', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() => successBody(cancelledData())).fetch,
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({
      cancelledAt: '2026-08-12T18:00:00.000Z',
      status: 'cancelled',
    })
  })

  test('refuses an unknown situation instead of guessing authorization', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() => successBody({ situacao: 'em_analise' })).fetch,
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({ cause: 'malformed_response', status: 'error' })
  })

  /** ADR-0029: erro de negócio chega como HTTP 200 — quem decide é o corpo, não o status. */
  test('treats HTTP 200 with success:false as a failure, matching the worker client table', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() => failureBody({ message: 'Nota inexistente' })).fetch,
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({
      rejection: { code: UNKNOWN_REJECTION_CODE, message: 'Nota inexistente' },
      status: 'rejected',
    })
  })

  test('ignores a code field in the refusal envelope, matching the worker client table', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() =>
        jsonResponse({ code: 'E001', message: 'Nota inexistente', success: false }),
      ).fetch,
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({
      rejection: { code: UNKNOWN_REJECTION_CODE, message: 'Nota inexistente' },
      status: 'rejected',
    })
  })

  test('classifies a non-2xx response as unexpected_status', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() => jsonResponse({ success: true, data: {} }, 503)).fetch,
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({ cause: 'unexpected_status', status: 'error' })
  })

  test('classifies an aborted request as timeout and never throws', async () => {
    const abortError = new Error('The operation timed out')
    abortError.name = 'TimeoutError'
    const client = await createNotaRpStatusClientFixture({ fetch: throwingFetch(abortError) })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({ cause: 'timeout', status: 'error' })
  })

  test('classifies any other transport error as transport_failure and never throws', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: throwingFetch(new Error('socket hang up')),
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome.status).toBe('error')
    expect(NOTA_RP_CAUSES.map(String)).toContain(outcome.cause ?? '')
    expect(outcome.cause).toBe('transport_failure')
  })
})

describe('Nota RP v2 document download parity', () => {
  test.each([
    ['xml', XML_BYTES, 'application/xml'],
    ['pdf', PDF_BYTES, 'application/pdf'],
  ] as const)('downloads the %s document as bytes', async (kind, bytes, contentType) => {
    const recorder = recordingFetch(() => binaryResponse({ bytes, contentType }))
    const client = await createNotaRpStatusClientFixture({ fetch: recorder.fetch })

    const outcome = await client.fetchDocument({ kind, providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({ bytes, contentType, status: 'ok' })
    expect(recorder.calls[0]?.headers['accept']).toBe(contentType)
    expect(recorder.calls[0]?.url).toContain(`/${kind}/${PROVIDER_DOCUMENT_ID}`)
  })

  /** Envelope JSON onde se esperava documento é falha — nunca byte para arquivar. */
  test('refuses a JSON envelope where bytes were expected, matching the worker client table', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() => failureBody({ message: 'Documento indisponivel' })).fetch,
    })

    const outcome = await client.fetchDocument({
      kind: 'xml',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(outcome).toEqual({
      rejection: { code: UNKNOWN_REJECTION_CODE, message: 'Documento indisponivel' },
      status: 'rejected',
    })
  })

  test('refuses a zero-length document body', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() =>
        binaryResponse({ bytes: new Uint8Array(), contentType: 'application/xml' }),
      ).fetch,
    })

    const outcome = await client.fetchDocument({
      kind: 'xml',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(outcome).toEqual({ cause: 'malformed_response', status: 'error' })
  })
})

describe('Nota RP v2 secret hygiene', () => {
  test('manda os dois cabeçalhos do provedor e nunca devolve o token numa mensagem', async () => {
    const recorder = recordingFetch(() =>
      failureBody({ code: 'E500', message: `token ${API_TOKEN} recusado` }),
    )
    const client = await createNotaRpStatusClientFixture({ fetch: recorder.fetch })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(recorder.calls[0]?.headers['x-auth-user-token']).toBe(API_TOKEN)
    expect(recorder.calls[0]?.headers['x-auth-im']).toBe(MUNICIPAL_REGISTRATION)
    expect(recorder.calls[0]?.headers['authorization']).toBeUndefined()
    expect(JSON.stringify(outcome)).not.toContain(API_TOKEN)
    expect(outcome.rejection?.message).toContain('[REDACTED]')
  })
})
