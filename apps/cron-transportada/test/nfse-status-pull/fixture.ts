/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Cópia por valor do vocabulário de fio de `apps/worker-transportada/test/nota-rp-v2/fixture.ts`,
 * reduzida ao que a reconciliação usa: consulta de situação e download de documento. As apps não
 * importam código-fonte uma da outra, e o cliente do cron é uma cópia reduzida do cliente do
 * worker — o contrato que guarda as duas leituras é comportamental (`nota-rp-parity.contract.ts`),
 * não diff de arquivo.
 *
 * O formato de fio continua **inferido** (ver `## T019` em
 * `specs/032-nota-de-servico-municipal/evidence.md`). Quando o T030 medir a API real, o acerto de
 * nome de campo é aqui e no cliente — nenhum `test(...)` muda, porque o que eles provam é semântica.
 */

export type NotaRpRejectionShape = {
  code: string
  message: string
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

type NotaRpStatusClientShape = {
  fetchDocument(input: {
    kind: 'pdf' | 'xml'
    providerDocumentId: string
  }): Promise<NotaRpDocumentOutcomeShape>
  fetchStatus(input: { providerDocumentId: string }): Promise<NotaRpStatusOutcomeShape>
}

type NotaRpV2ConfigShape = {
  baseUrl: string
  municipalRegistration: string
  timeoutMilliseconds: number
  token: string
}

type FetchCall = {
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

/** `cause` é classificação estável, nunca a mensagem do erro — mensagem carrega URL e cabeçalho. */
export const NOTA_RP_CAUSES = [
  'malformed_response',
  'not_found',
  'timeout',
  'transport_failure',
  'unexpected_status',
] as const

/** A consulta devolve a nota dentro de `results[]` — ver o cabeçalho deste arquivo. */
export function successBody(note: Readonly<Record<string, unknown>>): Response {
  return jsonResponse({ results: [note], success: true })
}

/** A recusa da v2 é `{success:false, message}` e nada mais — código só existe dentro do postback. */
export function failureBody(input: { message: string }): Response {
  return jsonResponse({ message: input.message, success: false })
}

export function authorizedData(): Readonly<Record<string, unknown>> {
  return {
    CodigoVerificacao: 'VER-0001',
    DataEmissao: '2026-08-12T13:45:00.000Z',
    Erro: [],
    Nfse: '4321',
    Status: 'Autorizada',
    id_nota: PROVIDER_DOCUMENT_ID,
  }
}

/**
 * Corpo medido em produção em 19/08/2026 (nota 5254907, a primeira autorizada de verdade): o
 * `Status` é `"Sucesso"` e não existe `CodigoVerificacao` — o código sai no fim de `Link`.
 */
export function authorizedByLinkData(): Readonly<Record<string, unknown>> {
  return {
    DataEmissao: '2026-08-19',
    Erro: [],
    Link: 'https://notarp.com.br/nota/20935293/65/C7217CD1F',
    Nfse: '65',
    Status: 'Sucesso',
    id_nota: PROVIDER_DOCUMENT_ID,
  }
}

export function pendingData(): Readonly<Record<string, unknown>> {
  return { Erro: [], Nfse: '0', Status: 'Processando', id_nota: PROVIDER_DOCUMENT_ID }
}

/** Corpo medido em produção em 19/08/2026: a recusa da prefeitura vem em `Erro[]`. */
export function rejectedData(): Readonly<Record<string, unknown>> {
  return {
    Erro: [
      {
        Codigo: 'E320',
        Correcao: 'Consulte o Manual da NFS-e.',
        Mensagem: 'Item da lista de servicos incompativel com o CNAE informado',
      },
    ],
    Nfse: '0',
    Status: 'Falha',
    id_nota: PROVIDER_DOCUMENT_ID,
  }
}

export function cancelledData(): Readonly<Record<string, unknown>> {
  return {
    DataCancelamento: '2026-08-12T18:00:00.000Z',
    Erro: [],
    Nfse: '4321',
    Status: 'Cancelada',
    id_nota: PROVIDER_DOCUMENT_ID,
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

export async function createNotaRpStatusClientFixture(input: {
  config?: Partial<NotaRpV2ConfigShape>
  fetch: FetchStub
}): Promise<NotaRpStatusClientShape> {
  const module = (await import(
    '../../src/nfse-status-pull/infrastructure/nota-rp-v2.client.js'
  )) as {
    createNotaRpStatusClient(dependencies: {
      config: NotaRpV2ConfigShape
      fetch: FetchStub
    }): NotaRpStatusClientShape
  }

  return module.createNotaRpStatusClient({
    config: {
      baseUrl: BASE_URL,
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
