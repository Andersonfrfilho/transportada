/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { describe, expect, test } from 'bun:test'

import './nota-rp-v2/no-bearer.contract.js'

import {
  API_TOKEN,
  BASE_URL,
  CALLBACK_TOKEN,
  CALLBACK_URL,
  MUNICIPAL_REGISTRATION,
  NOTA_RP_CAUSES,
  PROVIDER_DOCUMENT_ID,
  RPS,
  authorizedByLinkData,
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

/** `2` é "serviço não prestado" no vocabulário da v2. O `motivo` é código, e o código é string. */
const CANCELLATION_MOTIVE = '2'
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
      successBody({ Status: 'situacao_que_ninguem_viu', id_nota: PROVIDER_DOCUMENT_ID }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome.status).toBe('error')
    expect(outcome.cause).toBe('malformed_response')
  })

  /**
   * A recusa é o fato; o `Status` é só o rótulo dela. A nota 5253521 voltou com `Erro[]` cheia, e
   * ler o rótulo antes do fato deixaria a recusa disfarçada de resposta malformada — o trilho
   * adiaria a nota de meia em meia hora para sempre em vez de liquidá-la.
   */
  test('recusa em Erro[] vale mesmo com Status fora do vocabulário', async () => {
    const { fetch } = recordingFetch(() =>
      successBody({
        Erro: [{ Codigo: 'E215', Mensagem: 'Item da lista de servico incompativel' }],
        Status: 'situacao_que_ninguem_viu',
        id_nota: PROVIDER_DOCUMENT_ID,
      }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome).toEqual({
      rejection: { code: 'E215', message: 'Item da lista de servico incompativel' },
      status: 'rejected',
    })
  })

  /**
   * A nota 5253521 foi recusada por **dois** motivos ao mesmo tempo (`E215` e `E227`). Guardar só o
   * primeiro faz o operador corrigir o cadastro, reemitir e descobrir o segundo no ciclo seguinte —
   * uma rodada de emissão fiscal por erro escondido.
   */
  test('recusa com mais de um erro carrega todos, não só o primeiro', async () => {
    const { fetch } = recordingFetch(() =>
      successBody({
        Erro: [
          { Codigo: 'E215', Mensagem: 'Item da lista de servico incompativel' },
          { Codigo: 'E227', Mensagem: 'Aliquota Servicos fora do intervalo de 2% e 5%' },
        ],
        Status: 'Falha',
        id_nota: PROVIDER_DOCUMENT_ID,
      }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome.status).toBe('rejected')
    expect(outcome.rejection?.code).toBe('E215')
    expect(outcome.rejection?.message).toBe(
      'E215: Item da lista de servico incompativel · E227: Aliquota Servicos fora do intervalo de 2% e 5%',
    )
  })

  /**
   * Medido contra a conta autenticada: nota inexistente volta `200` com `success: true`, uma
   * `message` e **sem** `data`. Ler isso como resposta malformada esconde o caso mais banal do
   * trilho no meio das falhas de contrato.
   */
  test('nota inexistente é not_found, não resposta malformada', async () => {
    const { fetch } = recordingFetch(() =>
      jsonResponse({ message: 'Nenhuma nota encontrada com a busca realizada.', success: true }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome.status).toBe('error')
    expect(outcome.cause).toBe('not_found')
  })

  test('envelope de sucesso sem data e sem mensagem continua malformado', async () => {
    const { fetch } = recordingFetch(() => jsonResponse({ success: true }))
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome.cause).toBe('malformed_response')
  })

  test('o corpo medido com Status "Sucesso" e código no Link vira autorização arquivável', async () => {
    const { fetch } = recordingFetch(() => successBody(authorizedByLinkData()))
    const client = await createNotaRpV2ClientFixture({ fetch })

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

  test('sem o Link e sem o campo próprio, a autorização medida continua malformada', async () => {
    const withoutLink = Object.fromEntries(
      Object.entries(authorizedByLinkData()).filter(([field]) => field !== 'Link'),
    )
    const { fetch } = recordingFetch(() => successBody(withoutLink))
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome.cause).toBe('malformed_response')
  })

  test('autorização sem número ou sem código de verificação é resposta malformada', async () => {
    const { fetch } = recordingFetch(() =>
      successBody({ ...authorizedData(), CodigoVerificacao: '', Nfse: '' }),
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
      cancellationMotive: CANCELLATION_MOTIVE,
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    const body = JSON.parse(calls[0]?.body ?? 'null') as Record<string, unknown>
    expect(calls[0]?.method).toBe('POST')
    expect(calls[0]?.url).toBe(`${BASE_URL}/cancelar-nota`)
    // Conferir por `Object.values` era cego a nome de chave — foi assim que `motivo_cancelamento` passou.
    expect(body['id_nota']).toBe(PROVIDER_DOCUMENT_ID)
    expect(body['motivo']).toBe(CANCELLATION_MOTIVE)
    expect(body).not.toHaveProperty('motivo_cancelamento')
    expect(outcome.status).toBe('accepted')
  })

  /**
   * O `motivo` é código, e a prefeitura recusa o cancelamento quando recebe texto no lugar dele —
   * recusa que só aparece dias depois, na consulta. O texto livre do operador para na API e não
   * chega aqui: o cliente não tem por onde recebê-lo.
   */
  test('o corpo leva código, nunca o texto livre do operador', async () => {
    const { calls, fetch } = recordingFetch(() => successBody(cancelledData()))
    const client = await createNotaRpV2ClientFixture({ fetch })

    await client.cancel({
      cancellationMotive: CANCELLATION_MOTIVE,
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    const body = calls[0]?.body ?? ''
    expect(body).not.toContain(CANCELLATION_REASON)
    expect((JSON.parse(body) as Record<string, unknown>)['motivo']).toMatch(/^[0-9]$/)
  })

  /** `id_nota` sai como veio: o provedor documenta número, e um `Number()` cego viraria `NaN`. */
  test('o id do provedor atravessa sem conversão', async () => {
    const { calls, fetch } = recordingFetch(() => successBody(cancelledData()))
    const client = await createNotaRpV2ClientFixture({ fetch })

    await client.cancel({
      cancellationMotive: CANCELLATION_MOTIVE,
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    const body = JSON.parse(calls[0]?.body ?? 'null') as Record<string, unknown>
    expect(body['id_nota']).toBe(PROVIDER_DOCUMENT_ID)
  })

  test('trata HTTP 200 com success:false como recusa do cancelamento', async () => {
    const { fetch } = recordingFetch(() =>
      failureBody({ message: 'Prazo de cancelamento expirado' }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.cancel({
      cancellationMotive: CANCELLATION_MOTIVE,
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(outcome.status).toBe('rejected')
    expect(outcome.rejection).toMatchObject({
      code: 'NOTA_RP_UNKNOWN',
      message: 'Prazo de cancelamento expirado',
    })
  })

  /** O outcome é lido pelo write-back e vai para log: nem o código nem o id do provedor voltam nele. */
  test('não devolve o motivo do cancelamento no outcome de falha', async () => {
    const { fetch } = recordingFetch(() =>
      failureBody({ message: 'Prazo de cancelamento expirado' }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.cancel({
      cancellationMotive: CANCELLATION_MOTIVE,
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(JSON.stringify(outcome)).not.toContain(CANCELLATION_REASON)
    expect(JSON.stringify(outcome)).not.toContain(PROVIDER_DOCUMENT_ID)
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

  // O changelog da v2 diz base64, e não há conta de homologação onde conferir antes da primeira nota.
  test('decodifica o XML que vem em base64, para arquivar documento e não texto', async () => {
    const { fetch } = recordingFetch(() =>
      binaryResponse({
        bytes: new TextEncoder().encode(Buffer.from(XML_BYTES).toString('base64')),
        contentType: 'application/xml',
      }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchDocument({
      kind: 'xml',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(outcome.status).toBe('ok')
    expect(outcome.bytes).toEqual(XML_BYTES)
  })

  test('decodifica o PDF que vem em base64', async () => {
    const { fetch } = recordingFetch(() =>
      binaryResponse({
        bytes: new TextEncoder().encode(Buffer.from(PDF_BYTES).toString('base64')),
        contentType: 'application/pdf',
      }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchDocument({
      kind: 'pdf',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(outcome.status).toBe('ok')
    expect(outcome.bytes).toEqual(PDF_BYTES)
  })

  // Adiar é o lado seguro: a nota não liquida sem XML, e nada errado entra no bucket.
  test('recusa corpo que não é o documento nem base64 dele', async () => {
    const { fetch } = recordingFetch(() =>
      binaryResponse({
        bytes: new TextEncoder().encode('documento indisponivel'),
        contentType: 'application/xml',
      }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchDocument({
      kind: 'xml',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(outcome.status).toBe('error')
    expect(outcome.cause).toBe('malformed_response')
    expect(outcome.bytes).toBeUndefined()
  })

  /*
   * Medido em produção em 19/08/2026 (nota 5254907, já autorizada): `/xml` e `/pdf` respondem
   * `application/json` com `{success:true, base64_file}` — o documento cru nunca chega. Sem abrir
   * o envelope, a nota autorizada era adiada de cinco em cinco minutos com o XML do outro lado.
   */
  test('abre o envelope medido com base64_file e devolve o XML como documento', async () => {
    const { fetch } = recordingFetch(() =>
      jsonResponse({ base64_file: Buffer.from(XML_BYTES).toString('base64'), success: true }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchDocument({
      kind: 'xml',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(outcome.status).toBe('ok')
    expect(outcome.contentType).toBe('application/xml')
    expect(outcome.bytes).toEqual(XML_BYTES)
  })

  test('abre o envelope medido com base64_file e devolve o PDF como documento', async () => {
    const { fetch } = recordingFetch(() =>
      jsonResponse({ base64_file: Buffer.from(PDF_BYTES).toString('base64'), success: true }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchDocument({
      kind: 'pdf',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(outcome.status).toBe('ok')
    expect(outcome.contentType).toBe('application/pdf')
    expect(outcome.bytes).toEqual(PDF_BYTES)
  })

  // Envelope de sucesso sem o documento dentro não tem byte para arquivar: adiar é o lado seguro.
  test('recusa envelope de sucesso sem base64_file', async () => {
    const { fetch } = recordingFetch(() => jsonResponse({ success: true }))
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchDocument({
      kind: 'xml',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(outcome.status).toBe('error')
    expect(outcome.cause).toBe('malformed_response')
    expect(outcome.bytes).toBeUndefined()
  })

  test('aceita o XML cru com espaço e BOM antes da abertura', async () => {
    const { fetch } = recordingFetch(() =>
      binaryResponse({
        bytes: new TextEncoder().encode(`\uFEFF\n  ${new TextDecoder().decode(XML_BYTES)}`),
        contentType: 'application/xml',
      }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchDocument({
      kind: 'xml',
      providerDocumentId: PROVIDER_DOCUMENT_ID,
    })

    expect(outcome.status).toBe('ok')
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
        cancellationMotive: CANCELLATION_MOTIVE,
        providerDocumentId: PROVIDER_DOCUMENT_ID,
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

  /**
   * São **dois** segredos no mesmo pedido, e o segundo é o mais fácil de esquecer: o `callbackToken`
   * não vai em cabeçalho, vai dentro da `CallbackUrl`, no corpo do `/emitir`. Recusa de validação
   * costuma devolver o campo recusado na `message` — e é justamente aqui que a URL é o assunto.
   */
  test('a recusa que devolve a CallbackUrl sai sem o token de callback', async () => {
    const { fetch } = recordingFetch(() =>
      failureBody({ message: `CallbackUrl invalida: ${CALLBACK_URL}` }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.issue({ rps: RPS })

    expect(outcome.status).toBe('rejected')
    expect(outcome.rejection?.message ?? '').not.toContain(CALLBACK_TOKEN)
  })

  test('a consulta que devolve a CallbackUrl na mensagem de erro também sai redigida', async () => {
    const { fetch } = recordingFetch(() =>
      successBody({
        Erro: [{ Codigo: 'E999', Mensagem: `Retorno nao entregue em ${CALLBACK_URL}` }],
        Status: 'Falha',
        id_nota: PROVIDER_DOCUMENT_ID,
      }),
    )
    const client = await createNotaRpV2ClientFixture({ fetch })

    const outcome = await client.fetchStatus({ providerDocumentId: PROVIDER_DOCUMENT_ID })

    expect(outcome.status).toBe('rejected')
    expect(outcome.rejection?.message ?? '').not.toContain(CALLBACK_TOKEN)
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
        cancellationMotive: CANCELLATION_MOTIVE,
        providerDocumentId: PROVIDER_DOCUMENT_ID,
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
