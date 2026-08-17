/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import './nota-rp-v2/no-bearer.contract.js'

import {
  API_TOKEN,
  BASE_URL,
  MUNICIPAL_REGISTRATION,
  NOTA_RP_CAUSES,
  PROVIDER_DOCUMENT_ID,
  RPS,
  authorizedData,
  binaryResponse,
  cancelledData,
  createNotaRpV2ClientFixture,
  failureBody,
  issuedBody,
  jsonResponse,
  pendingData,
  recordingFetch,
  rejectedData,
  successBody,
  throwingFetch,
} from './nota-rp-v2/fixture.js'

const CANCELLATION_REASON = 'Servico nao executado — carga recusada no destino'
const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37])
const XML_BYTES = new TextEncoder().encode('<CompNfse><Nfse/></CompNfse>')

function isStableCause(value: string | undefined): boolean {
  return NOTA_RP_CAUSES.some((candidate) => candidate === value)
}

describe('Nota RP v2 client — emissão', () => {
  test('publica o RPS em POST /emitir e devolve o id_nota do provedor', async () => {
    const { calls, fetch } = recordingFetch(() => issuedBody())
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.issue({ rps: RPS })

    expect(calls).toHaveLength(1)
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toBe(`${BASE_URL}/emitir`)
    expect(calls[0]?.headers['content-type']).toContain('application/json')
    expect(outcome).toMatchObject({
      status: 'accepted',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })
  })

  // O gateway congela o RPS; o cliente é transporte. Reescrever o corpo aqui seria uma segunda
  // fonte da verdade fiscal entre o que a empresa aprovou e o que a prefeitura recebe.
  test('transmite o RPS recebido sem acrescentar nem remover campo', async () => {
    const { calls, fetch } = recordingFetch(() => issuedBody())
    const client = await createNotaRpV2ClientFixture({ fetch })

    await client.issue({ rps: RPS })

    expect(JSON.parse(calls[0]?.body ?? 'null')).toEqual({ ...RPS })
  })

  /**
   * A recusa da v2 é `{success:false, message}` e nada mais — o código da prefeitura só existe no
   * postback, dentro de `MensagemRetorno[].Codigo`. O marcador estável ocupa o lugar dele para a
   * linha não ficar sem classificação nenhuma.
   */
  test('trata HTTP 200 com success:false como rejeição, com a mensagem da prefeitura', async () => {
    const { fetch } = recordingFetch(() => failureBody({ message: 'Inscricao municipal invalida' }))
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.issue({ rps: RPS })

    expect(outcome.status).toBe('rejected')
    expect(outcome.rejection).toMatchObject({
      code: 'NOTA_RP_UNKNOWN',
      message: 'Inscricao municipal invalida',
    })
    expect(outcome.providerDocumentId).toBeUndefined()
  })

  test('não aceita corpo de sucesso sem id_nota', async () => {
    const { fetch } = recordingFetch(() => jsonResponse({ message: 'ok', success: true }))
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.issue({ rps: RPS })

    expect(outcome.status).toBe('error')
    expect(outcome.cause).toBe('malformed_response')
  })

  /**
   * O `id_nota` do `/emitir` é **numérico e no topo** do envelope — o `data` que exigíamos não
   * existe nesse endpoint. Exigi-lo arquivava emissão aceita como `malformed_response`, e a nota
   * seguia viva no provedor sem referência nenhuma do nosso lado.
   */
  test('lê o id_nota numérico do envelope oficial do /emitir', async () => {
    const { fetch } = recordingFetch(() => issuedBody())
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.issue({ rps: RPS })

    expect(outcome).toMatchObject({
      providerDocumentId: PROVIDER_DOCUMENT_ID,
      status: 'accepted',
    })
  })

  /** Recusa de campo do próprio pedido — a mensagem é o que o operador tem para corrigir. */
  test('devolve a mensagem da recusa de validação do pedido', async () => {
    const { fetch } = recordingFetch(() =>
      failureBody({ message: 'Por favor informe uma data de emissão válida' }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.issue({ rps: RPS })

    expect(outcome.status).toBe('rejected')
    expect(outcome.rejection?.message).toBe('Por favor informe uma data de emissão válida')
  })
})

describe('Nota RP v2 client — consulta', () => {
  test('consulta GET /notas/ pelo id_nota e reconhece a nota autorizada', async () => {
    const { calls, fetch } = recordingFetch(() => successBody(authorizedData()))
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    const requested = new URL(calls[0]?.url ?? '')
    expect(calls[0]?.method).toBe('GET')
    expect(requested.pathname).toBe('/api/v2/notas/')
    expect(requested.searchParams.get('id_nota')).toBe(PROVIDER_DOCUMENT_ID)
    expect(outcome.status).toBe('authorized')
    expect(outcome.document).toMatchObject({
      fiscalNumber: '4321',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
      verificationCode: 'VER-0001',
    })
  })

  test('distingue pendente, rejeitada e cancelada', async () => {
    const pendingClient = await createNotaRpV2ClientFixture({
      fetch: recordingFetch(() => successBody(pendingData())).fetch,
    })
    const rejectedClient = await createNotaRpV2ClientFixture({
      fetch: recordingFetch(() => successBody(rejectedData())).fetch,
    })
    const cancelledClient = await createNotaRpV2ClientFixture({
      fetch: recordingFetch(() => successBody(cancelledData())).fetch,
    })

    const pending = await pendingClient.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })
    const rejected = await rejectedClient.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })
    const cancelled = await cancelledClient.fetchStatus({
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(pending.status).toBe('pending')
    expect(pending.document).toBeUndefined()
    expect(rejected.status).toBe('rejected')
    expect(rejected.rejection).toMatchObject({ code: 'E320' })
    expect(cancelled.status).toBe('cancelled')
  })

  // Ler `success:false` como "ainda processando" deixaria a nota em pending_authorization para
  // sempre, e o operador sem a rejeição que explica o que corrigir.
  test('não confunde HTTP 200 com success:false com nota ainda pendente', async () => {
    const { fetch } = recordingFetch(() => failureBody({ message: 'Nota nao localizada' }))
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome.status).not.toBe('pending')
    expect(outcome.status).toBe('rejected')
    expect(outcome.rejection).toMatchObject({
      code: 'NOTA_RP_UNKNOWN',
      message: 'Nota nao localizada',
    })
  })

  test('situação fora do vocabulário conhecido não vira autorização', async () => {
    const { fetch } = recordingFetch(() =>
      successBody({ id_nota: PROVIDER_DOCUMENT_ID, situacao: 'situacao_que_ninguem_viu' }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome.status).toBe('error')
    expect(outcome.cause).toBe('malformed_response')
  })

  test('autorização sem número ou sem código de verificação é resposta malformada', async () => {
    const { fetch } = recordingFetch(() =>
      successBody({ ...authorizedData(), codigo_verificacao: '', numero_nota: '' }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome.status).toBe('error')
    expect(outcome.cause).toBe('malformed_response')
  })
})

describe('Nota RP v2 client — cancelamento', () => {
  test('pede o cancelamento em POST /cancelar-nota com id_nota e motivo', async () => {
    const { calls, fetch } = recordingFetch(() => successBody(cancelledData()))
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.cancel({
      providerDocumentId: PROVIDER_DOCUMENT_ID,
      reason: CANCELLATION_REASON,
    })

    const body = JSON.parse(calls[0]?.body ?? 'null') as Record<string, unknown>
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toBe(`${BASE_URL}/cancelar-nota`)
    // Conferir por `Object.values` era cego a nome de chave — foi assim que `motivo_cancelamento` passou.
    expect(body['id_nota']).toBe(PROVIDER_DOCUMENT_ID)
    expect(body['motivo']).toBe(CANCELLATION_REASON)
    expect(body).not.toHaveProperty('motivo_cancelamento')
    expect(outcome.status).toBe('accepted')
  })

  test('trata HTTP 200 com success:false como recusa do cancelamento', async () => {
    const { fetch } = recordingFetch(() =>
      failureBody({ message: 'Prazo de cancelamento expirado' }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.cancel({
      providerDocumentId: PROVIDER_DOCUMENT_ID,
      reason: CANCELLATION_REASON,
    })

    expect(outcome.status).toBe('rejected')
    expect(outcome.rejection).toMatchObject({
      code: 'NOTA_RP_UNKNOWN',
      message: 'Prazo de cancelamento expirado',
    })
  })

  // O motivo é texto livre digitado por operador: pode carregar nome ou telefone de cliente.
  test('não devolve o motivo do cancelamento no outcome de falha', async () => {
    const { fetch } = recordingFetch(() =>
      failureBody({ message: 'Prazo de cancelamento expirado' }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.cancel({
      providerDocumentId: PROVIDER_DOCUMENT_ID,
      reason: CANCELLATION_REASON,
    })

    expect(JSON.stringify(outcome)).not.toContain(CANCELLATION_REASON)
  })
})

describe('Nota RP v2 client — download de XML e PDF', () => {
  test('baixa o XML autorizado com os bytes e o content type da resposta', async () => {
    const { calls, fetch } = recordingFetch(() =>
      binaryResponse({ bytes: XML_BYTES, contentType: 'application/xml' }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchDocument({
      kind: 'xml',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(calls[0]?.method).toBe('GET')
    expect(calls[0]?.url).toBe(`${BASE_URL}/xml/${PROVIDER_DOCUMENT_ID}`)
    expect(outcome.status).toBe('ok')
    expect(outcome.contentType).toBe('application/xml')
    expect(outcome.bytes).toEqual(XML_BYTES)
  })

  // `application/pdf` é caminho novo no produto: nenhum outro trilho fiscal arquiva PDF.
  test('baixa o PDF da nota como binário, não como texto', async () => {
    const { calls, fetch } = recordingFetch(() =>
      binaryResponse({ bytes: PDF_BYTES, contentType: 'application/pdf' }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchDocument({
      kind: 'pdf',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(calls[0]?.url).toBe(`${BASE_URL}/pdf/${PROVIDER_DOCUMENT_ID}`)
    expect(outcome.status).toBe('ok')
    expect(outcome.contentType).toBe('application/pdf')
    expect(outcome.bytes).toEqual(PDF_BYTES)
  })

  // Sem isto, o envelope de erro em JSON seria arquivado em stored_objects como XML fiscal.
  test('trata HTTP 200 com success:false no download como falha, e não como documento', async () => {
    const { fetch } = recordingFetch(() => failureBody({ message: 'Documento indisponivel' }))
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchDocument({
      kind: 'xml',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(outcome.status).toBe('rejected')
    expect(outcome.rejection).toMatchObject({
      code: 'NOTA_RP_UNKNOWN',
      message: 'Documento indisponivel',
    })
    expect(outcome.bytes).toBeUndefined()
  })

  test('não devolve documento de zero byte', async () => {
    const { fetch } = recordingFetch(() =>
      binaryResponse({ bytes: new Uint8Array(), contentType: 'application/pdf' }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchDocument({
      kind: 'pdf',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(outcome.status).toBe('error')
    expect(outcome.cause).toBe('malformed_response')
    expect(outcome.bytes).toBeUndefined()
  })
})

describe('Nota RP v2 client — falhas de transporte', () => {
  test('timeout, 5xx, corpo não-JSON e JSON inesperado viram outcome tipado', async () => {
    const timeoutClient = await createNotaRpV2ClientFixture({
      fetch: throwingFetch(Object.assign(new Error('timed out'), { name: 'TimeoutError' })),
    })
    const serverErrorClient = await createNotaRpV2ClientFixture({
      fetch: recordingFetch(() => jsonResponse({ message: 'gateway down' }, 502)).fetch,
    })
    const notJsonClient = await createNotaRpV2ClientFixture({
      fetch: recordingFetch(() => new Response('<html>offline</html>', { status: 200 })).fetch,
    })
    const unexpectedShapeClient = await createNotaRpV2ClientFixture({
      fetch: recordingFetch(() => jsonResponse(['nota'])).fetch,
    })

    const timeout = await timeoutClient.issue({ rps: RPS })
    const serverError = await serverErrorClient.issue({ rps: RPS })
    const notJson = await notJsonClient.issue({ rps: RPS })
    const unexpectedShape = await unexpectedShapeClient.issue({ rps: RPS })

    expect(timeout).toMatchObject({ status: 'error', cause: 'timeout' })
    expect(serverError).toMatchObject({ status: 'error', cause: 'unexpected_status' })
    expect(notJson).toMatchObject({ status: 'error', cause: 'malformed_response' })
    expect(unexpectedShape).toMatchObject({ status: 'error', cause: 'malformed_response' })
  })

  test('nenhuma operação deixa exceção escapar', async () => {
    const failure = new Error('connection reset by peer')
    const client = await createNotaRpV2ClientFixture({ fetch: throwingFetch(failure) })

    const outcomes = [
      await client.issue({ rps: RPS }),
      await client.cancel({
        providerDocumentId: PROVIDER_DOCUMENT_ID,
        reason: CANCELLATION_REASON,
      }),
      await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID }),
      await client.fetchDocument({ kind: 'xml', providerDocumentId: PROVIDER_DOCUMENT_ID }),
      await client.fetchDocument({ kind: 'pdf', providerDocumentId: PROVIDER_DOCUMENT_ID }),
    ]

    for (const outcome of outcomes) {
      expect(outcome.status).toBe('error')
      expect(isStableCause(outcome.cause)).toBe(true)
    }
  })
})

describe('Nota RP v2 client — o token não vaza', () => {
  test('envia o token em cabeçalho, nunca na URL', async () => {
    const { calls, fetch } = recordingFetch(() => issuedBody())
    const client = await createNotaRpV2ClientFixture({ fetch })

    await client.issue({ rps: RPS })
    await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })
    await client.fetchDocument({ kind: 'pdf', providerDocumentId: PROVIDER_DOCUMENT_ID })

    for (const call of calls) {
      expect(call.headers['x-auth-user-token']).toBe(API_TOKEN)
      expect(call.url).not.toContain(API_TOKEN)
      expect(call.body ?? '').not.toContain(API_TOKEN)
    }
  })
})

/**
 * A Nota RP não lê `Authorization`. Ela exige `X-AUTH-USER-TOKEN` (a conta) e `X-AUTH-IM` (qual
 * empresa dentro dela). Este bloco existe porque a versão anterior deste arquivo **fixava o
 * cabeçalho errado**: o teste passava, e nenhuma chamada nossa estava autenticada.
 */
describe('Nota RP v2 client — os dois cabeçalhos que o provedor exige', () => {
  test('manda X-AUTH-USER-TOKEN e X-AUTH-IM em toda chamada, e não manda authorization', async () => {
    const { calls, fetch } = recordingFetch(() => issuedBody())
    const client = await createNotaRpV2ClientFixture({ fetch })

    await client.issue({ rps: RPS })
    await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })
    await client.fetchDocument({ kind: 'pdf', providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call.headers['x-auth-user-token']).toBe(API_TOKEN)
      expect(call.headers['x-auth-im']).toBe(MUNICIPAL_REGISTRATION)
      expect(call.headers['authorization']).toBeUndefined()
    }
  })

  test('a inscrição municipal vem da credencial, não de constante do cliente', async () => {
    const { calls, fetch } = recordingFetch(() => issuedBody())
    const client = await createNotaRpV2ClientFixture({
      config: { municipalRegistration: '98765432' },
      fetch,
    })

    await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(calls[0]?.headers['x-auth-im']).toBe('98765432')
  })

  // Erro de rede costuma carregar a requisição inteira na mensagem — inclusive o cabeçalho.
  // Por isso `cause` é classificação estável, não a mensagem do erro.
  test('não repassa a mensagem do erro de transporte para o outcome', async () => {
    const leaky = new Error(
      `fetch failed: POST ${BASE_URL}/emitir authorization=Bearer ${API_TOKEN}`,
    )
    const client = await createNotaRpV2ClientFixture({ fetch: throwingFetch(leaky) })

    const outcomes = [
      await client.issue({ rps: RPS }),
      await client.cancel({
        providerDocumentId: PROVIDER_DOCUMENT_ID,
        reason: CANCELLATION_REASON,
      }),
      await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID }),
      await client.fetchDocument({ kind: 'xml', providerDocumentId: PROVIDER_DOCUMENT_ID }),
    ]

    for (const outcome of outcomes) {
      expect(JSON.stringify(outcome)).not.toContain(API_TOKEN)
      expect(isStableCause(outcome.cause)).toBe(true)
    }
  })

  test('rejeição do provedor não carrega o token no outcome', async () => {
    const { fetch } = recordingFetch(() => failureBody({ message: `token ${API_TOKEN} invalido` }))
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.issue({ rps: RPS })

    expect(outcome.status).toBe('rejected')
    expect(JSON.stringify(outcome)).not.toContain(API_TOKEN)
  })
})
