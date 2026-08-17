/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * O formato de fio abaixo vem da coleção oficial da v2 (`API Nota RP (v2).postman_collection.json`
 * + `changelog (v2).md`), que chegou em 17/08/2026 e desfez a inferência anterior — ver a Fase A2
 * de `specs/040-nota-rp-autenticada/tasks.md`. Todo corpo de resposta continua montado pelas
 * fábricas deste arquivo: o acerto de nome de campo é aqui, num lugar só, e nenhum `test(...)` do
 * contrato muda, porque o que eles provam é semântica (200 com `success:false` é falha, exceção não
 * escapa, token não vaza), não vocabulário.
 *
 * ⚠️ O que **ainda** é inferido é a consulta: `GET /notas/` devolve corpo em forma de DataTables
 * (`{"draw":0,"data":[],"recordsFiltered":0,"recordsTotal":0}`), sem `success`, e a coleção não
 * mostra nota nenhuma preenchida — os nomes de campo de `authorizedData`/`rejectedData` seguem por
 * medir.
 */

export type NotaRpRejectionShape = {
  code: string
  message: string
}

export type NotaRpIssueOutcomeShape = {
  status: 'accepted' | 'rejected' | 'error'
  cause?: string
  providerDocumentId?: string
  rejection?: NotaRpRejectionShape
}

export type NotaRpCancelOutcomeShape = {
  status: 'accepted' | 'rejected' | 'error'
  cause?: string
  rejection?: NotaRpRejectionShape
}

export type NotaRpStatusOutcomeShape = {
  status: 'authorized' | 'cancelled' | 'pending' | 'rejected' | 'error'
  cancelledAt?: string
  cause?: string
  document?: {
    authorizedAt: string
    fiscalNumber: string
    providerDocumentId: string
    verificationCode: string
  }
  rejection?: NotaRpRejectionShape
}

export type NotaRpDocumentOutcomeShape = {
  status: 'ok' | 'rejected' | 'error'
  bytes?: Uint8Array
  cause?: string
  contentType?: string
  rejection?: NotaRpRejectionShape
}

type NotaRpV2ClientShape = {
  cancel(input: {
    cancellationMotive: '2' | '4'
    providerDocumentId: string
  }): Promise<NotaRpCancelOutcomeShape>
  fetchDocument(input: {
    kind: 'pdf' | 'xml'
    providerDocumentId: string
  }): Promise<NotaRpDocumentOutcomeShape>
  fetchStatus(input: { providerDocumentId: string }): Promise<NotaRpStatusOutcomeShape>
  issue(input: { rps: Readonly<Record<string, unknown>> }): Promise<NotaRpIssueOutcomeShape>
}

type NotaRpV2ConfigShape = {
  baseUrl: string
  callbackToken: string
  municipalRegistration: string
  timeoutMilliseconds: number
  token: string
}

type FetchCall = {
  body: string | undefined
  headers: Record<string, string>
  method: string
  url: string
}

type FetchStub = (input: string, init: RequestInit) => Promise<Response>

/** Segredo sintético: se ele aparecer em qualquer outcome, o contrato falha. */
export const API_TOKEN = 'notarp-v2-synthetic-token-do-not-leak'

export const BASE_URL = 'https://nota-rp.invalid/api/v2'

/** O token identifica a conta; a inscrição municipal, qual empresa dentro dela. Os dois são exigidos. */
export const MUNICIPAL_REGISTRATION = '12345678'

export const PROVIDER_DOCUMENT_ID = '900123456'

/**
 * O **segundo** segredo do pedido. Ele não vai em cabeçalho: viaja dentro da `CallbackUrl`, no corpo
 * do `/emitir`. Se ele aparecer em qualquer outcome, o contrato falha — pelo mesmo motivo que o
 * `API_TOKEN`.
 */
export const CALLBACK_TOKEN = 'notarp-v2-synthetic-callback-token-do-not-leak'

export const CALLBACK_URL = `https://transportada.invalid/public/nfse-callbacks/${CALLBACK_TOKEN}`

/**
 * O RPS chega pronto ao cliente: quem traduz o payload congelado para o vocabulário da v2 é o
 * gateway (T020). O cliente é transporte e leitura de resposta — é a única fronteira que dá para
 * contratar sem a documentação do provedor em mãos.
 */
export const RPS = {
  CallbackUrl: CALLBACK_URL,
  Discriminacao: 'Transporte rodoviario de cargas referente as notas 1234, 1235 e 1236.',
  ValorServicos: '1250.0000',
} as const

/** `cause` é classificação estável, nunca a mensagem do erro — mensagem carrega URL e cabeçalho. */
export const NOTA_RP_CAUSES = [
  'malformed_response',
  'timeout',
  'transport_failure',
  'unexpected_status',
] as const

export function successBody(data: Readonly<Record<string, unknown>>): Response {
  return jsonResponse({ data, success: true })
}

/**
 * A recusa da v2 é `{success:false, message}` e nada mais — não existe campo de código no envelope
 * síncrono. O código da prefeitura só chega no postback, dentro de `MensagemRetorno[].Codigo`.
 */
export function failureBody(input: { message: string }): Response {
  return jsonResponse({ message: input.message, success: false })
}

/**
 * O envelope do `/emitir` na coleção oficial da v2 — `id_nota` **no topo e numérico**, sem `data`:
 *
 * ```json
 * { "success": true, "message": "Pedido de emissão enviado com sucesso!", "id_nota": 30201 }
 * ```
 *
 * Exigir um objeto `data` era o que transformava emissão aceita em `malformed_response`.
 */
export function issuedBody(): Response {
  return jsonResponse({
    id_nota: Number(PROVIDER_DOCUMENT_ID),
    message: 'Pedido de emissão enviado com sucesso!',
    success: true,
  })
}

export function authorizedData(): Readonly<Record<string, unknown>> {
  return {
    codigo_verificacao: 'VER-0001',
    data_emissao: '2026-08-12T13:45:00.000Z',
    id_nota: PROVIDER_DOCUMENT_ID,
    numero_nota: '4321',
    situacao: 'autorizada',
  }
}

export function pendingData(): Readonly<Record<string, unknown>> {
  return { id_nota: PROVIDER_DOCUMENT_ID, situacao: 'processando' }
}

export function rejectedData(): Readonly<Record<string, unknown>> {
  return {
    codigo_erro: 'E320',
    id_nota: PROVIDER_DOCUMENT_ID,
    mensagem_erro: 'Item da lista de servicos incompativel com o CNAE informado',
    situacao: 'rejeitada',
  }
}

export function cancelledData(): Readonly<Record<string, unknown>> {
  return {
    data_cancelamento: '2026-08-12T18:00:00.000Z',
    id_nota: PROVIDER_DOCUMENT_ID,
    situacao: 'cancelada',
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

export function binaryResponse(input: {
  bytes: Uint8Array
  contentType: string
  status?: number
}): Response {
  return new Response(new Uint8Array(input.bytes), {
    headers: { 'content-type': input.contentType },
    status: input.status ?? 200,
  })
}

export function recordingFetch(respond: (call: FetchCall) => Promise<Response> | Response): {
  calls: FetchCall[]
  fetch: FetchStub
} {
  const calls: FetchCall[] = []
  return {
    calls,
    fetch: async (url, init) => {
      const call: FetchCall = {
        body: typeof init.body === 'string' ? init.body : undefined,
        headers: normalizeHeaders(init.headers),
        method: init.method ?? 'GET',
        url,
      }
      calls.push(call)
      return respond(call)
    },
  }
}

export function throwingFetch(error: unknown): FetchStub {
  return async () => {
    throw error
  }
}

export async function createNotaRpV2ClientFixture(input: {
  config?: Partial<NotaRpV2ConfigShape>
  fetch: FetchStub
}): Promise<NotaRpV2ClientShape> {
  const module = (await import('../../src/nfse-issuance/infrastructure/nota-rp-v2.client.js')) as {
    createNotaRpV2Client(dependencies: {
      config: NotaRpV2ConfigShape
      fetch: FetchStub
    }): NotaRpV2ClientShape
  }

  return module.createNotaRpV2Client({
    config: {
      baseUrl: BASE_URL,
      callbackToken: CALLBACK_TOKEN,
      municipalRegistration: MUNICIPAL_REGISTRATION,
      timeoutMilliseconds: 8000,
      token: API_TOKEN,
      ...input.config,
    },
    fetch: input.fetch,
  })
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const normalized: Record<string, string> = {}
  new Headers(headers).forEach((value, key) => {
    normalized[key.toLowerCase()] = value
  })
  return normalized
}
