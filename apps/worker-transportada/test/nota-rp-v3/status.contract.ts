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
  listBody,
  noteListItem,
  recordingFetch,
  textResponse,
  throwingFetch,
  type FetchCall,
  type NotaRpV3StatusOutcomeShape,
} from './fixture.js'

const PENDING_STATUSES = ['Criada', 'Enviando', 'Pendente'] as const
const REQUIRED_AUTHORIZATION_FIELDS = ['numero', 'chave_acesso'] as const

async function statusWith(
  respond: () => Response,
): Promise<{ calls: FetchCall[]; outcome: NotaRpV3StatusOutcomeShape }> {
  const { calls, fetch } = recordingFetch(respond)
  const client = await createNotaRpV3ClientFixture({ fetch })
  const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })
  return { calls, outcome }
}

describe('Nota RP v3 client — consulta: pedido', () => {
  test('consulta GET {origem}/api/v3/nota/listar?id_nota=N com os cabeçalhos da v3', async () => {
    const { calls } = await statusWith(() => listBody([noteListItem()]))

    const requested = new URL(calls[0]?.url ?? '')
    expect(calls[0]?.method).toBe('GET')
    expect(requested.origin).toBe(PROVIDER_ORIGIN)
    expect(requested.pathname).toBe('/api/v3/nota/listar')
    expect(requested.searchParams.get('id_nota')).toBe(PROVIDER_DOCUMENT_ID)
    expect(calls[0]?.body).toBeUndefined()
    expect(calls[0]?.headers['x-auth-user-token']).toBe(API_TOKEN)
    expect(calls[0]?.headers['x-auth-cnpj']).toBe(COMPANY_TAX_ID_DIGITS)
    expect(calls[0]?.headers['x-auth-im']).toBe(MUNICIPAL_REGISTRATION_DIGITS)
    expect(calls[0]?.headers['accept']).toContain('application/json')
  })
})

describe('Nota RP v3 client — consulta: classificação por status', () => {
  for (const status of PENDING_STATUSES) {
    test(`${status} é pending`, async () => {
      const { outcome } = await statusWith(() =>
        listBody([noteListItem({ chave_acesso: '', numero: '', status })]),
      )

      expect(outcome).toEqual({ status: 'pending' })
    })
  }

  // A chave de acesso do padrão nacional ocupa o lugar do código de verificação da v2.
  test('Sucesso com número, data e chave de acesso é authorized', async () => {
    const { outcome } = await statusWith(() => listBody([noteListItem()]))

    expect(outcome).toEqual({
      document: {
        authorizedAt: '2024-01-15T00:00:00-03:00',
        fiscalNumber: '123',
        providerDocumentId: PROVIDER_DOCUMENT_ID,
        serviceAmount: '1500',
        verificationCode: 'ABC123XYZ789',
      },
      status: 'authorized',
    })
  })

  for (const field of REQUIRED_AUTHORIZATION_FIELDS) {
    test(`Sucesso sem ${field} não é autorização arquivável: malformed_response`, async () => {
      const note = Object.fromEntries(
        Object.entries(noteListItem()).filter(([key]) => key !== field),
      )
      const { outcome } = await statusWith(() => listBody([note]))

      expect(outcome).toEqual({ cause: 'malformed_response', status: 'error' })
    })
  }

  // data_emissao é campo depreciado do swagger e não é obrigatório: a competência é a fonte.
  test('o instante autorizado vem de data_competencia, ancorado em -03:00', async () => {
    const note = Object.fromEntries(
      Object.entries(noteListItem({ data_competencia: '2024-01-15' })).filter(
        ([key]) => key !== 'data_emissao',
      ),
    )
    const { outcome } = await statusWith(() => listBody([note]))

    const authorizedAt = outcome.document?.authorizedAt ?? ''
    expect(authorizedAt).toBe('2024-01-15T00:00:00-03:00')
    expect(
      new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(
        new Date(authorizedAt),
      ),
    ).toBe('2024-01-15')
  })

  test('sem data_competencia, data_emissao serve de reserva', async () => {
    const note = Object.fromEntries(
      Object.entries(noteListItem({ data_emissao: '2024-02-20' })).filter(
        ([key]) => key !== 'data_competencia',
      ),
    )
    const { outcome } = await statusWith(() => listBody([note]))

    expect(outcome.document?.authorizedAt).toBe('2024-02-20T00:00:00-03:00')
  })

  test('Sucesso sem nenhuma das duas datas é malformed_response', async () => {
    const note = Object.fromEntries(
      Object.entries(noteListItem()).filter(
        ([key]) => key !== 'data_competencia' && key !== 'data_emissao',
      ),
    )
    const { outcome } = await statusWith(() => listBody([note]))

    expect(outcome).toEqual({ cause: 'malformed_response', status: 'error' })
  })

  // O listar não traz o motivo da Falha; sem código sintético a reconciliação a tomaria por MALFORMED.
  test('Falha é rejected NOTA_RP_FALHA com mensagem fixa em pt-BR', async () => {
    const first = await statusWith(() => listBody([noteListItem({ status: 'Falha' })]))
    const second = await statusWith(() =>
      listBody([noteListItem({ chave_acesso: '', numero: '', status: 'Falha' })]),
    )

    expect(first.outcome.status).toBe('rejected')
    expect(first.outcome.rejection?.code).toBe('NOTA_RP_FALHA')
    expect(first.outcome.rejection?.message.length ?? 0).toBeGreaterThan(0)
    expect(second.outcome.rejection).toEqual(first.outcome.rejection)
  })

  test('Cancelada é cancelled', async () => {
    const { outcome } = await statusWith(() => listBody([noteListItem({ status: 'Cancelada' })]))

    expect(outcome.status).toBe('cancelled')
  })

  test('status fora do vocabulário da v3 é malformed_response, nunca autorização', async () => {
    const { outcome } = await statusWith(() => listBody([noteListItem({ status: 'Processando' })]))

    expect(outcome).toEqual({ cause: 'malformed_response', status: 'error' })
  })
})

/**
 * ADR 0098 §7: recusar uma nota que não se achou libera a reemissão e duplica uma nota talvez já
 * autorizada — o caso das notas nascidas na v2. Ausência adia; não recusa.
 */
describe('Nota RP v3 client — consulta: nota ausente adia, nunca recusa', () => {
  test('results vazio é error not_found', async () => {
    const { outcome } = await statusWith(() => listBody([]))

    expect(outcome).toEqual({ cause: 'not_found', status: 'error' })
  })

  test('404 do listar é error not_found', async () => {
    const { outcome } = await statusWith(() =>
      errorBody({ message: 'Recurso não encontrado', status: 404 }),
    )

    expect(outcome).toEqual({ cause: 'not_found', status: 'error' })
  })
})

describe('Nota RP v3 client — consulta: nota de outro id', () => {
  test('results[0] com id_nota diferente do pedido é error not_found, nunca authorized', async () => {
    const { outcome } = await statusWith(() => listBody([noteListItem({ id_nota: 99999 })]))

    expect(outcome).toEqual({ cause: 'not_found', status: 'error' })
  })
})

describe('Nota RP v3 client — consulta: falhas', () => {
  test('401/403 na consulta não viram recusa de nota', async () => {
    const unauthorized = await statusWith(() =>
      errorBody({ message: 'Você precisa estar logado para usar este recurso', status: 401 }),
    )
    const forbidden = await statusWith(() =>
      errorBody({ message: 'Você não tem permissão para realizar esta ação', status: 403 }),
    )

    expect(unauthorized.outcome.status).toBe('error')
    expect(forbidden.outcome.status).toBe('error')
  })

  test('5xx é error unexpected_status', async () => {
    const { outcome } = await statusWith(() =>
      errorBody({ message: 'Houve um erro inesperado', status: 500 }),
    )

    expect(outcome).toEqual({ cause: 'unexpected_status', status: 'error' })
  })

  test('429 e 503 são error unexpected_status, nunca not_found', async () => {
    const throttled = await statusWith(() =>
      errorBody({ message: 'Limite de requisições excedido', status: 429 }),
    )
    const unavailable = await statusWith(() =>
      errorBody({ message: 'Serviço indisponível', status: 503 }),
    )

    expect(throttled.outcome).toEqual({ cause: 'unexpected_status', status: 'error' })
    expect(unavailable.outcome).toEqual({ cause: 'unexpected_status', status: 'error' })
  })

  test('corpo que não é JSON é malformed_response', async () => {
    const { outcome } = await statusWith(() => textResponse('<html>bad gateway</html>'))

    expect(outcome).toEqual({ cause: 'malformed_response', status: 'error' })
  })

  test('envelope sem success é malformed_response', async () => {
    const { outcome } = await statusWith(() => jsonResponse({ results: [noteListItem()] }))

    expect(outcome).toEqual({ cause: 'malformed_response', status: 'error' })
  })

  test('falha de rede é error transport_failure, sem vazar segredo', async () => {
    const client = await createNotaRpV3ClientFixture({
      fetch: throwingFetch(new TypeError(`connect ECONNREFUSED ${API_TOKEN}`)),
    })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({ cause: 'transport_failure', status: 'error' })
    expect(containsSecret(outcome)).toBe(false)
  })
})
