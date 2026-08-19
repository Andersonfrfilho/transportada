/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  API_TOKEN,
  authorizedByLinkData,
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
  test('reads "Processando" as pending, matching the worker client table', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() => successBody(pendingData())).fetch,
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({ status: 'pending' })
  })

  test('reads "Autorizada" as an archivable document, matching the worker client table', async () => {
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

  test('reads the measured "Sucesso" body as authorized, matching the worker client table', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() => successBody(authorizedByLinkData())).fetch,
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({
      document: {
        authorizedAt: '2026-08-19',
        fiscalNumber: '65',
        providerDocumentId: PROVIDER_DOCUMENT_ID,
        verificationCode: 'C7217CD1F',
      },
      status: 'authorized',
    })
  })

  test('refuses the measured authorization when neither the field nor the link carries the verification code, matching the worker client table', async () => {
    const withoutLink = Object.fromEntries(
      Object.entries(authorizedByLinkData()).filter(([field]) => field !== 'Link'),
    )
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() => successBody(withoutLink)).fetch,
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({ cause: 'malformed_response', status: 'error' })
  })

  test('refuses an authorization without number or verification code, matching the worker client table', async () => {
    const incomplete = Object.fromEntries(
      Object.entries(authorizedData()).filter(([field]) => field !== 'Nfse'),
    )
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() => successBody(incomplete)).fetch,
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({ cause: 'malformed_response', status: 'error' })
  })

  test('reads "Falha" as a rejection with code and message, matching the worker client table', async () => {
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

  test('reads "Cancelada" with its timestamp, matching the worker client table', async () => {
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
      fetch: recordingFetch(() => successBody({ Status: 'em_analise' })).fetch,
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({ cause: 'malformed_response', status: 'error' })
  })

  test('reads a filled Erro[] as a rejection even when the status is unknown, matching the worker client table', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() =>
        successBody({
          Erro: [{ Codigo: 'E215', Mensagem: 'Item da lista de servico incompativel' }],
          Status: 'situacao_que_ninguem_viu',
        }),
      ).fetch,
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({
      rejection: { code: 'E215', message: 'Item da lista de servico incompativel' },
      status: 'rejected',
    })
  })

  test('carries every rejection reason, not just the first, matching the worker client table', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() =>
        successBody({
          Erro: [
            { Codigo: 'E215', Mensagem: 'Item da lista de servico incompativel' },
            { Codigo: 'E227', Mensagem: 'Aliquota Servicos fora do intervalo de 2% e 5%' },
          ],
          Status: 'Falha',
        }),
      ).fetch,
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({
      rejection: {
        code: 'E215',
        message:
          'E215: Item da lista de servico incompativel · E227: Aliquota Servicos fora do intervalo de 2% e 5%',
      },
      status: 'rejected',
    })
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

  test('reads an empty result set as not_found, matching the worker client table', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() =>
        jsonResponse({
          message: 'Nenhuma nota encontrada com a busca realizada.',
          results: [],
          success: true,
        }),
      ).fetch,
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({ cause: 'not_found', status: 'error' })
  })

  test('keeps malformed_response for a success envelope with neither results nor message', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() => jsonResponse({ success: true })).fetch,
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({ cause: 'malformed_response', status: 'error' })
  })

  test('classifies a non-2xx response as unexpected_status', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() => jsonResponse({ results: [], success: true }, 503)).fetch,
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

  test.each([
    ['xml', XML_BYTES, 'application/xml'],
    ['pdf', PDF_BYTES, 'application/pdf'],
  ] as const)(
    'decodes a base64 %s body, matching the worker client table',
    async (kind, bytes, contentType) => {
      const client = await createNotaRpStatusClientFixture({
        fetch: recordingFetch(() =>
          binaryResponse({
            bytes: new TextEncoder().encode(Buffer.from(bytes).toString('base64')),
            contentType,
          }),
        ).fetch,
      })

      const outcome = await client.fetchDocument({ kind, providerDocumentId: PROVIDER_DOCUMENT_ID })

      expect(outcome).toEqual({ bytes, contentType, status: 'ok' })
    },
  )

  /** Nem documento nem base64 dele: adiar é o lado seguro, porque a nota não liquida sem o XML. */
  test('refuses a body that is neither the document nor base64 of it', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() =>
        binaryResponse({
          bytes: new TextEncoder().encode('documento indisponivel'),
          contentType: 'application/xml',
        }),
      ).fetch,
    })

    const outcome = await client.fetchDocument({
      kind: 'xml',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(outcome).toEqual({ cause: 'malformed_response', status: 'error' })
  })

  /**
   * Medido em produção em 19/08/2026 (nota 5254907, já autorizada): `/xml` e `/pdf` respondem
   * `application/json` com `{success:true, base64_file}` — o documento cru nunca chega. Sem abrir
   * o envelope, a nota autorizada era adiada de cinco em cinco minutos com o XML do outro lado.
   */
  test.each([
    ['xml', XML_BYTES, 'application/xml'],
    ['pdf', PDF_BYTES, 'application/pdf'],
  ] as const)(
    'opens the measured %s envelope carrying base64_file, matching the worker client table',
    async (kind, bytes, contentType) => {
      const client = await createNotaRpStatusClientFixture({
        fetch: recordingFetch(() =>
          jsonResponse({ base64_file: Buffer.from(bytes).toString('base64'), success: true }),
        ).fetch,
      })

      const outcome = await client.fetchDocument({ kind, providerDocumentId: PROVIDER_DOCUMENT_ID })

      expect(outcome).toEqual({ bytes, contentType, status: 'ok' })
    },
  )

  /** Envelope de sucesso sem o documento dentro é falha: não há byte para arquivar. */
  test('refuses a success envelope without base64_file, matching the worker client table', async () => {
    const client = await createNotaRpStatusClientFixture({
      fetch: recordingFetch(() => jsonResponse({ success: true })).fetch,
    })

    const outcome = await client.fetchDocument({
      kind: 'xml',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(outcome).toEqual({ cause: 'malformed_response', status: 'error' })
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
    const recorder = recordingFetch(() => failureBody({ message: `token ${API_TOKEN} recusado` }))
    const client = await createNotaRpStatusClientFixture({ fetch: recorder.fetch })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(recorder.calls[0]?.headers['x-auth-user-token']).toBe(API_TOKEN)
    expect(recorder.calls[0]?.headers['x-auth-im']).toBe(MUNICIPAL_REGISTRATION)
    expect(recorder.calls[0]?.headers['authorization']).toBeUndefined()
    expect(JSON.stringify(outcome)).not.toContain(API_TOKEN)
    expect(outcome.rejection?.message).toContain('[REDACTED]')
  })
})
