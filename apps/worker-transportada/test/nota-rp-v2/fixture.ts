/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * A coleção oficial da Nota RP v2 não está no repositório: o formato de fio abaixo é **inferido**
 * do ADR-0029 e da spec 032, que nomeiam `id_nota`, `success`, `Discriminacao` e `CallbackUrl` e
 * mais nada. Por isso todo corpo de resposta é montado pelas fábricas deste arquivo — quando o
 * T030 medir a API real com a credencial de produção, o acerto de nome de campo é aqui, num lugar
 * só, e nenhum `test(...)` do contrato muda: o que eles provam é semântica (200 com
 * `success:false` é falha, exceção não escapa, token não vaza), não vocabulário.
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
  cancel(input: { providerDocumentId: string; reason: string }): Promise<NotaRpCancelOutcomeShape>
  fetchDocument(input: {
    kind: 'pdf' | 'xml'
    providerDocumentId: string
  }): Promise<NotaRpDocumentOutcomeShape>
  fetchStatus(input: { providerDocumentId: string }): Promise<NotaRpStatusOutcomeShape>
  issue(input: { rps: Readonly<Record<string, unknown>> }): Promise<NotaRpIssueOutcomeShape>
}

type NotaRpV2ConfigShape = {
  baseUrl: string
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

export const PROVIDER_DOCUMENT_ID = '900123456'

export const CALLBACK_URL = 'https://transportada.invalid/public/nfse-callbacks/opaque-token'

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

export function failureBody(input: { code: string; message: string }): Response {
  return jsonResponse({ code: input.code, message: input.message, success: false })
}

export function issuedData(): Readonly<Record<string, unknown>> {
  return { id_nota: PROVIDER_DOCUMENT_ID }
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
