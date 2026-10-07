/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import {
  API_TOKEN,
  BASE_URL_V2,
  CALLBACK_TOKEN,
  COMPANY_TAX_ID_DIGITS,
  EXPECTED_ISSUE_BODY,
  FROZEN_PAYLOAD,
  MUNICIPAL_REGISTRATION_DIGITS,
  PROVIDER_DOCUMENT_ID,
  PROVIDER_ORIGIN,
  PROVIDER_REQUEST_KEY,
  containsSecret,
  createNotaRpV3ClientFixture,
  duplicateRequestBody,
  errorBody,
  issuedBody,
  jsonResponse,
  parseBody,
  payloadWith,
  payloadWithout,
  recordingFetch,
  textResponse,
  throwingFetch,
  validationErrorBody,
  type FetchCall,
  type NotaRpV3IssueOutcomeShape,
} from './fixture.js'

const ISSUE_URL = `${PROVIDER_ORIGIN}/api/v3/nota/emitir`
const REJECTED_CLIENT_STATUSES = [400, 401, 403, 404, 422] as const
const RETRYABLE_STATUSES = [408, 425, 429, 500, 502, 503] as const

async function issueWith(input: {
  payload?: Readonly<Record<string, unknown>>
  providerDocumentId?: string
  respond?: () => Response
}): Promise<{ calls: FetchCall[]; outcome: NotaRpV3IssueOutcomeShape }> {
  const { calls, fetch } = recordingFetch(input.respond ?? issuedBody)
  const client = await createNotaRpV3ClientFixture({ fetch })
  const outcome = await client.issue({
    payload: input.payload ?? FROZEN_PAYLOAD,
    providerRequestKey: PROVIDER_REQUEST_KEY,
    ...(input.providerDocumentId === undefined
      ? {}
      : { providerDocumentId: input.providerDocumentId }),
  })
  return { calls, outcome }
}

describe('Nota RP v3 client — emissão: cabeçalhos e endereço', () => {
  test('emite em POST {origem}/api/v3/nota/emitir', async () => {
    const { calls } = await issueWith({})

    expect(calls).toHaveLength(1)
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toBe(ISSUE_URL)
  })

  test('envia token, CNPJ e IM só com dígitos e JSON nos dois sentidos', async () => {
    const { calls } = await issueWith({})

    const headers = calls[0]?.headers ?? {}
    expect(headers['x-auth-user-token']).toBe(API_TOKEN)
    expect(headers['x-auth-cnpj']).toBe(COMPANY_TAX_ID_DIGITS)
    expect(headers['x-auth-im']).toBe(MUNICIPAL_REGISTRATION_DIGITS)
    expect(headers['content-type']).toContain('application/json')
    expect(headers['accept']).toContain('application/json')
  })

  test('a chamada carrega sinal de timeout', async () => {
    const { calls } = await issueWith({})

    expect(calls[0]?.hasSignal).toBe(true)
  })

  // ADR 0098 §3: a mesma NFSE_PROVIDER_BASE_URL serve às duas versões; /api/v2/api/v3 é impossível.
  test('baseUrl com /api/v2, só com a origem ou com barra final dão a mesma URL v3', async () => {
    const urls: string[] = []
    for (const baseUrl of [BASE_URL_V2, PROVIDER_ORIGIN, `${PROVIDER_ORIGIN}/`]) {
      const { calls, fetch } = recordingFetch(issuedBody)
      const client = await createNotaRpV3ClientFixture({ config: { baseUrl }, fetch })
      await client.issue({ payload: FROZEN_PAYLOAD, providerRequestKey: PROVIDER_REQUEST_KEY })
      urls.push(calls[0]?.url ?? '')
    }

    expect(urls).toEqual([ISSUE_URL, ISSUE_URL, ISSUE_URL])
  })
})

describe('Nota RP v3 client — emissão: corpo a partir do payload congelado', () => {
  test('monta o corpo pela tabela de mapeamento do plano, sem campo a mais', async () => {
    const { calls } = await issueWith({})

    expect(parseBody(calls[0])).toEqual(EXPECTED_ISSUE_BODY)
  })

  test('data_competencia é o dia da tentativa em America/Sao_Paulo, dd/mm/aaaa', async () => {
    const { calls, fetch } = recordingFetch(issuedBody)
    const client = await createNotaRpV3ClientFixture({
      clock: () => new Date('2026-01-05T12:00:00.000Z'),
      fetch,
    })

    await client.issue({ payload: FROZEN_PAYLOAD, providerRequestKey: PROVIDER_REQUEST_KEY })

    expect(parseBody(calls[0])).toMatchObject({ servico: { data_competencia: '05/01/2026' } })
  })

  test('aliquota_issqn sai em percentual numérico a partir da fração do domínio', async () => {
    const { calls } = await issueWith({ payload: payloadWith({ issRate: '0.027500' }) })

    expect(parseBody(calls[0])).toMatchObject({ servico: { aliquota_issqn: 2.75 } })
  })

  test('valor_total e aliquota_simples_nacional são os números do payload, não recalculados', async () => {
    const { calls } = await issueWith({
      payload: payloadWith({ serviceAmount: '1250.10', simplesNationalRate: '4.500000' }),
    })

    expect(parseBody(calls[0])).toMatchObject({
      servico: { tributos_aproximados: { aliquota_simples_nacional: 4.5 }, valor_total: 1250.1 },
    })
  })

  test('issqn_retido acompanha issWithheld', async () => {
    const { calls } = await issueWith({ payload: payloadWith({ issWithheld: true }) })

    expect(parseBody(calls[0])).toMatchObject({ servico: { issqn_retido: true } })
  })

  test('complemento e telefone do tomador viajam só quando não vazios', async () => {
    const filled = await issueWith({
      payload: payloadWith({
        taker: {
          ...FROZEN_PAYLOAD.taker,
          address: { ...FROZEN_PAYLOAD.taker.address, complement: 'Sala 12', phone: '16999990000' },
        },
      }),
    })
    const empty = await issueWith({})

    expect(parseBody(filled.calls[0])).toMatchObject({
      tomador: { complemento: 'Sala 12', telefone: '16999990000' },
    })
    const emptyTaker = (parseBody(empty.calls[0]) as { tomador: Record<string, unknown> }).tomador
    expect(Object.keys(emptyTaker)).not.toContain('complemento')
    expect(Object.keys(emptyTaker)).not.toContain('telefone')
  })

  test('flags: hash_pedido é a chave recebida, webhook com o token, sem e-mail e sem regime', async () => {
    const { calls } = await issueWith({})

    const { flags } = parseBody(calls[0]) as { flags: Record<string, unknown> }
    expect(flags['hash_pedido']).toBe(PROVIDER_REQUEST_KEY)
    expect(flags['webhook_url']).toBe(
      `https://api.transportada.invalid/public/nfse-callbacks/${CALLBACK_TOKEN}`,
    )
    expect(flags['enviar_email']).toBe(false)
    expect(Object.keys(flags)).not.toContain('regime')
  })

  test('id_nota vai no corpo, numérico, só quando a entrada traz providerDocumentId', async () => {
    const reissue = await issueWith({ providerDocumentId: PROVIDER_DOCUMENT_ID })
    const first = await issueWith({})

    expect(parseBody(reissue.calls[0])).toMatchObject({
      flags: { hash_pedido: PROVIDER_REQUEST_KEY },
      id_nota: Number(PROVIDER_DOCUMENT_ID),
    })
    expect(Object.keys(parseBody(first.calls[0]) as object)).not.toContain('id_nota')
  })
})

describe('Nota RP v3 client — emissão: documentos e endereço', () => {
  test('CNPJ alfanumérico perde só a pontuação, no cabeçalho e no tomador', async () => {
    const { calls, fetch } = recordingFetch(issuedBody)
    const client = await createNotaRpV3ClientFixture({
      config: { taxId: '1A.B2C.3D4/0001-95' },
      fetch,
    })

    await client.issue({
      payload: payloadWith({ taker: { ...FROZEN_PAYLOAD.taker, taxId: 'AB.CDE.FGH/0001-12' } }),
      providerRequestKey: PROVIDER_REQUEST_KEY,
    })

    expect(calls[0]?.headers['x-auth-cnpj']).toBe('1AB2C3D4000195')
    expect(parseBody(calls[0])).toMatchObject({ tomador: { documento: 'ABCDEFGH000112' } })
  })

  test('sem taker.address o tomador vai só com documento e nome', async () => {
    const { taker } = FROZEN_PAYLOAD
    const { calls, outcome } = await issueWith({
      payload: payloadWith({ taker: { legalName: taker.legalName, taxId: taker.taxId } }),
    })

    expect(outcome.status).toBe('accepted')
    expect(parseBody(calls[0])).toMatchObject({
      tomador: { documento: '98765432000110', nome: 'Comercial Exemplo Ltda' },
    })
    expect(Object.keys((parseBody(calls[0]) as { tomador: object }).tomador)).toEqual([
      'documento',
      'nome',
    ])
  })

  test('callbackBaseUrl sem https omite flags.webhook_url', async () => {
    const { calls, fetch } = recordingFetch(issuedBody)
    const client = await createNotaRpV3ClientFixture({
      config: { callbackBaseUrl: 'http://api.transportada.invalid' },
      fetch,
    })

    await client.issue({ payload: FROZEN_PAYLOAD, providerRequestKey: PROVIDER_REQUEST_KEY })

    const { flags } = parseBody(calls[0]) as { flags: Record<string, unknown> }
    expect(Object.keys(flags)).not.toContain('webhook_url')
  })
})

describe('Nota RP v3 client — emissão: recusa local antes do provedor', () => {
  test('payload fora do formato é recusa NFSE_PAYLOAD_INVALID, sem HTTP e sem exceção', async () => {
    for (const payload of [
      payloadWith({ serviceAmount: 2601.95 }),
      payloadWith({ taker: 'sem tomador' }),
      payloadWithout('description'),
      payloadWithout('taker'),
    ]) {
      const { calls, outcome } = await issueWith({ payload })

      expect(calls).toHaveLength(0)
      expect(outcome.status).toBe('rejected')
      expect(outcome.rejection?.code).toBe('NFSE_PAYLOAD_INVALID')
    }
  })

  test('descrição acima de 2000 caracteres é recusa nomeada, sem HTTP', async () => {
    const { calls, outcome } = await issueWith({
      payload: payloadWith({ description: 'x'.repeat(2001) }),
    })

    expect(calls).toHaveLength(0)
    expect(outcome.rejection?.code).toBe('NFSE_DESCRIPTION_TOO_LONG_FOR_PROVIDER')
  })

  test('sem nationalTaxationCode é recusa fatal nomeada, sem chamada HTTP', async () => {
    const { calls, outcome } = await issueWith({ payload: payloadWithout('nationalTaxationCode') })

    expect(calls).toHaveLength(0)
    expect(outcome.status).toBe('rejected')
    expect(outcome.rejection?.code).toBe('NFSE_NATIONAL_TAXATION_CODE_MISSING')
  })

  test('sem simplesNationalRate é recusa fatal nomeada, sem chamada HTTP', async () => {
    const { calls, outcome } = await issueWith({ payload: payloadWithout('simplesNationalRate') })

    expect(calls).toHaveLength(0)
    expect(outcome.status).toBe('rejected')
    expect(outcome.rejection?.code).toBe('NFSE_SIMPLES_RATE_MISSING')
  })

  // Só '1' tem par conhecido; mapear os demais por palpite emitiria nota com incidência errada.
  test('issExigibility diferente de 1 é recusa nomeada, sem chamada HTTP', async () => {
    const { calls, outcome } = await issueWith({ payload: payloadWith({ issExigibility: '3' }) })

    expect(calls).toHaveLength(0)
    expect(outcome.status).toBe('rejected')
    expect(outcome.rejection?.code).toBe('NFSE_ISS_EXIGIBILITY_UNSUPPORTED')
  })
})

describe('Nota RP v3 client — emissão: respostas', () => {
  test('200 com success:true devolve accepted com o id_nota como texto', async () => {
    const { outcome } = await issueWith({})

    expect(outcome).toEqual({ providerDocumentId: PROVIDER_DOCUMENT_ID, status: 'accepted' })
  })

  test('200 com success:false é recusa — decide o corpo, não o status', async () => {
    const { outcome } = await issueWith({
      respond: () => jsonResponse({ message: 'Tomador inválido', success: false }),
    })

    expect(outcome.status).toBe('rejected')
    expect(outcome.rejection?.message).toBe('Tomador inválido')
    expect(outcome.providerDocumentId).toBeUndefined()
  })

  test('200 com success:true sem id_nota é malformed_response', async () => {
    const { outcome } = await issueWith({
      respond: () => jsonResponse({ message: 'ok', success: true }),
    })

    expect(outcome).toEqual({ cause: 'malformed_response', status: 'error' })
  })

  test('409 do hash_pedido com id_nota é a emissão original: accepted', async () => {
    const { outcome } = await issueWith({ respond: duplicateRequestBody })

    expect(outcome).toEqual({ providerDocumentId: PROVIDER_DOCUMENT_ID, status: 'accepted' })
  })

  test('409 sem id_nota no corpo é recusa NOTA_RP_HTTP_409', async () => {
    const { outcome } = await issueWith({
      respond: () => errorBody({ message: 'Nota não pode ser reeditada', status: 409 }),
    })

    expect(outcome.status).toBe('rejected')
    expect(outcome.rejection?.code).toBe('NOTA_RP_HTTP_409')
  })

  for (const status of REJECTED_CLIENT_STATUSES) {
    test(`${status} é recusa NOTA_RP_HTTP_${status} com a mensagem do provedor`, async () => {
      const { outcome } = await issueWith({
        respond: () => errorBody({ message: `Recusa ${status} do provedor`, status }),
      })

      expect(outcome.status).toBe('rejected')
      expect(outcome.rejection).toEqual({
        code: `NOTA_RP_HTTP_${status}`,
        message: `Recusa ${status} do provedor`,
      })
    })
  }

  test('422 do swagger, com errors[], é recusa NOTA_RP_HTTP_422', async () => {
    const { outcome } = await issueWith({ respond: validationErrorBody })

    expect(outcome.status).toBe('rejected')
    expect(outcome.rejection?.code).toBe('NOTA_RP_HTTP_422')
  })

  test('mensagem de recusa sai sem token nem callback token e com até 500 caracteres', async () => {
    const message = `campo flags.webhook_url invalido ${CALLBACK_TOKEN} token ${API_TOKEN} ${'x'.repeat(900)}`
    const { outcome } = await issueWith({ respond: () => errorBody({ message, status: 422 }) })

    expect(outcome.status).toBe('rejected')
    expect(containsSecret(outcome)).toBe(false)
    expect(outcome.rejection?.message.length ?? 0).toBeLessThanOrEqual(500)
    expect(outcome.rejection?.message).toContain('campo flags.webhook_url invalido')
  })

  test('success:false em 200 também é saneado', async () => {
    const { outcome } = await issueWith({
      respond: () => jsonResponse({ message: `eco ${API_TOKEN}`, success: false }),
    })

    expect(outcome.status).toBe('rejected')
    expect(containsSecret(outcome)).toBe(false)
  })

  for (const status of RETRYABLE_STATUSES) {
    test(`${status} é recuperável: error unexpected_status, nunca recusa`, async () => {
      const { outcome } = await issueWith({
        respond: () => errorBody({ message: 'Houve um erro inesperado', status }),
      })

      expect(outcome).toEqual({ cause: 'unexpected_status', status: 'error' })
    })
  }

  test('falha de rede é error transport_failure, sem vazar a mensagem do erro', async () => {
    const client = await createNotaRpV3ClientFixture({
      fetch: throwingFetch(new TypeError(`fetch failed for token ${API_TOKEN}`)),
    })

    const outcome = await client.issue({
      payload: FROZEN_PAYLOAD,
      providerRequestKey: PROVIDER_REQUEST_KEY,
    })

    expect(outcome).toEqual({ cause: 'transport_failure', status: 'error' })
  })

  test('timeout é error timeout', async () => {
    const client = await createNotaRpV3ClientFixture({
      fetch: throwingFetch(new DOMException('The operation timed out.', 'TimeoutError')),
    })

    const outcome = await client.issue({
      payload: FROZEN_PAYLOAD,
      providerRequestKey: PROVIDER_REQUEST_KEY,
    })

    expect(outcome).toEqual({ cause: 'timeout', status: 'error' })
  })

  test('corpo 200 que não é JSON é malformed_response', async () => {
    const { outcome } = await issueWith({ respond: () => textResponse('<html>ok</html>') })

    expect(outcome).toEqual({ cause: 'malformed_response', status: 'error' })
  })
})
