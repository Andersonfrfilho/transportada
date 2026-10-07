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
  containsSecret,
  createNotaRpV3ClientFixture,
  errorBody,
  jsonResponse,
  parseBody,
  recordingFetch,
  throwingFetch,
  type FetchCall,
  type NotaRpV3CancelOutcomeShape,
} from './fixture.js'

const CANCEL_URL = `${PROVIDER_ORIGIN}/api/v3/nota/cancelar`

async function cancelWith(input: {
  cancellationMotive?: '2' | '4'
  respond?: () => Response
}): Promise<{ calls: FetchCall[]; outcome: NotaRpV3CancelOutcomeShape }> {
  const { calls, fetch } = recordingFetch(
    input.respond ??
      ((): Response => jsonResponse({ message: 'Nota cancelada com sucesso!', success: true })),
  )
  const client = await createNotaRpV3ClientFixture({ fetch })
  const outcome = await client.cancel({
    cancellationMotive: input.cancellationMotive ?? '2',
    providerDocumentId: PROVIDER_DOCUMENT_ID,
  })
  return { calls, outcome }
}

describe('Nota RP v3 client — cancelamento: pedido', () => {
  test('cancela em POST {origem}/api/v3/nota/cancelar com os cabeçalhos da v3', async () => {
    const { calls } = await cancelWith({})

    expect(calls).toHaveLength(1)
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toBe(CANCEL_URL)
    expect(calls[0]?.headers['x-auth-user-token']).toBe(API_TOKEN)
    expect(calls[0]?.headers['x-auth-cnpj']).toBe(COMPANY_TAX_ID_DIGITS)
    expect(calls[0]?.headers['x-auth-im']).toBe(MUNICIPAL_REGISTRATION_DIGITS)
    expect(calls[0]?.headers['content-type']).toContain('application/json')
  })

  // O banco guarda o código da v2; a v3 lê o motivo por nome.
  test("motivo '2' vira servico_nao_prestado, id_nota numérico e sem e-mail", async () => {
    const { calls } = await cancelWith({ cancellationMotive: '2' })

    expect(parseBody(calls[0])).toMatchObject({
      enviar_email: false,
      id_nota: Number(PROVIDER_DOCUMENT_ID),
      motivo: 'servico_nao_prestado',
    })
  })

  test("motivo '4' (nota duplicada, sem par direto) vira outros com descricao 'Nota duplicada'", async () => {
    const { calls } = await cancelWith({ cancellationMotive: '4' })

    expect(parseBody(calls[0])).toMatchObject({
      descricao: 'Nota duplicada',
      enviar_email: false,
      id_nota: Number(PROVIDER_DOCUMENT_ID),
      motivo: 'outros',
    })
  })
})

describe('Nota RP v3 client — cancelamento: respostas', () => {
  test('200 com success:true é accepted', async () => {
    const { outcome } = await cancelWith({})

    expect(outcome).toEqual({ status: 'accepted' })
  })

  test('200 com success:false é rejected, com a mensagem saneada', async () => {
    const { outcome } = await cancelWith({
      respond: () =>
        jsonResponse({ message: `Nota sem chave de acesso ${API_TOKEN}`, success: false }),
    })

    expect(outcome.status).toBe('rejected')
    expect(containsSecret(outcome)).toBe(false)
  })

  // Decisão aberta (evidence.md E15): 409 "nota já cancelada" poderia valer accepted. Não inventar.
  test('409 é rejected NOTA_RP_HTTP_409', async () => {
    const { outcome } = await cancelWith({
      respond: () =>
        errorBody({
          message: 'Operação não pode ser realizada devido a conflito de estado',
          status: 409,
        }),
    })

    expect(outcome.status).toBe('rejected')
    expect(outcome.rejection?.code).toBe('NOTA_RP_HTTP_409')
  })

  test('5xx é error unexpected_status', async () => {
    const { outcome } = await cancelWith({
      respond: () => errorBody({ message: 'Houve um erro inesperado', status: 500 }),
    })

    expect(outcome).toEqual({ cause: 'unexpected_status', status: 'error' })
  })

  test('falha de rede é error transport_failure', async () => {
    const client = await createNotaRpV3ClientFixture({
      fetch: throwingFetch(new TypeError('fetch failed')),
    })

    const outcome = await client.cancel({
      cancellationMotive: '2',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(outcome).toEqual({ cause: 'transport_failure', status: 'error' })
  })
})
