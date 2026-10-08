/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Formato de fio da Nota RP v3, tirado do `swagger.yaml` oficial (OpenAPI 3, v3.0.0) recortado em
 * `docs/ai-context/worker-transportada.md` § "A Nota RP v3". Todo corpo de resposta sai das fábricas
 * deste arquivo: se a medição em produção desmentir o swagger, o acerto é aqui, num lugar só.
 *
 * Diferente da v2, o cliente v3 **monta o corpo** a partir do payload congelado (tabela de
 * mapeamento do `plan.md` da spec 250): só renomeia e formata, nunca recalcula.
 */

export type NotaRpV3RejectionShape = {
  code: string
  message: string
}

export type NotaRpV3IssueOutcomeShape = {
  status: 'accepted' | 'rejected' | 'error'
  cause?: string
  providerDocumentId?: string
  rejection?: NotaRpV3RejectionShape
}

export type NotaRpV3CancelOutcomeShape = {
  status: 'accepted' | 'rejected' | 'error'
  cause?: string
  rejection?: NotaRpV3RejectionShape
}

export type NotaRpV3StatusOutcomeShape = {
  status: 'authorized' | 'cancelled' | 'pending' | 'rejected' | 'error'
  cancelledAt?: string
  cause?: string
  document?: {
    authorizedAt: string
    fiscalNumber: string
    providerDocumentId: string
    serviceAmount?: string
    verificationCode: string
  }
  rejection?: NotaRpV3RejectionShape
}

export type NotaRpV3DocumentOutcomeShape = {
  status: 'ok' | 'rejected' | 'error'
  bytes?: Uint8Array
  cause?: string
  contentType?: string
  rejection?: NotaRpV3RejectionShape
}

export type NotaRpV3ClientShape = {
  cancel(input: {
    cancellationMotive: '2' | '4'
    providerDocumentId: string
  }): Promise<NotaRpV3CancelOutcomeShape>
  fetchDocument(input: {
    kind: 'pdf' | 'xml'
    providerDocumentId: string
  }): Promise<NotaRpV3DocumentOutcomeShape>
  fetchStatus(input: { providerDocumentId: string }): Promise<NotaRpV3StatusOutcomeShape>
  issue(input: {
    payload: Readonly<Record<string, unknown>>
    providerDocumentId?: string
    providerRequestKey: string
  }): Promise<NotaRpV3IssueOutcomeShape>
}

export type NotaRpV3ConfigShape = {
  baseUrl: string
  callbackBaseUrl: string
  callbackToken: string
  municipalRegistration: string
  taxId: string
  timeoutMilliseconds: number
  token: string
}

export type FetchCall = {
  body: string | undefined
  hasSignal: boolean
  headers: Record<string, string>
  method: string
  url: string
}

export type FetchStub = (input: string, init: RequestInit) => Promise<Response>

/** Segredo sintético: se ele aparecer em qualquer outcome, o contrato falha. */
export const API_TOKEN = 'notarp-v3-synthetic-token-do-not-leak'

/** Viaja dentro de `flags.webhook_url`, e a recusa de validação pode ecoar o campo. */
export const CALLBACK_TOKEN = 'notarp-v3-synthetic-callback-token-do-not-leak'

export const CALLBACK_BASE_URL = 'https://api.transportada.invalid'

export const PROVIDER_ORIGIN = 'https://nota-rp.invalid'

/** A mesma variável da v2: o cliente v3 usa só a origem dela (ADR 0098 §3). */
export const BASE_URL_V2 = `${PROVIDER_ORIGIN}/api/v2`

/** Formatados de propósito: o fio exige só dígitos (`X-Auth-CNPJ`, `X-Auth-IM`). */
export const COMPANY_TAX_ID = '12.345.678/0001-90'
export const COMPANY_TAX_ID_DIGITS = '12345678000190'
export const MUNICIPAL_REGISTRATION = '1.234.567-8'
export const MUNICIPAL_REGISTRATION_DIGITS = '12345678'

export const PROVIDER_DOCUMENT_ID = '12345'
export const PROVIDER_REQUEST_KEY = '0199b7a4-5c1e-7d2a-9f3b-1a2b3c4d5e6f'

/** 23h30 em São Paulo de 07/10 — já é 08/10 em UTC. A competência é o dia daqui. */
export const ISSUED_AT = new Date('2026-10-08T02:30:00.000Z')
export const ISSUED_ON_SAO_PAULO = '07/10/2026'

export const NOTA_RP_CAUSES = [
  'malformed_response',
  'not_found',
  'timeout',
  'transport_failure',
  'unexpected_status',
] as const

/** O payload congelado pela API na v3 (`freezeNfseIssuancePayload` com os dois campos novos). */
export const FROZEN_PAYLOAD = {
  cnaeCode: '4930202',
  description: 'Transporte rodoviario de cargas referente as notas 1234, 1235 e 1236.',
  issAmount: '52.04',
  issExigibility: '1',
  issRate: '0.020000',
  issWithheld: false,
  municipalTaxationCode: '160101',
  municipalityIbgeCode: '3543402',
  nationalTaxationCode: '160201',
  nbsCode: '106011100',
  serviceAmount: '2601.95',
  serviceListItem: '16.02',
  simplesNationalRate: '2.000000',
  taker: {
    address: {
      city: 'Ribeirão Preto',
      complement: '',
      district: 'Centro',
      number: '1000',
      phone: '',
      postalCode: '14010040',
      state: 'SP',
      street: 'Avenida Jerônimo Gonçalves',
    },
    legalName: 'Comercial Exemplo Ltda',
    taxId: '98.765.432/0001-10',
  },
} as const

/** O corpo que o mapeamento do `plan.md` produz para `FROZEN_PAYLOAD` — nada recalculado. */
export const EXPECTED_ISSUE_BODY = {
  flags: {
    enviar_email: false,
    hash_pedido: PROVIDER_REQUEST_KEY,
    webhook_url: `${CALLBACK_BASE_URL}/public/nfse-callbacks/${CALLBACK_TOKEN}`,
  },
  servico: {
    aliquota_issqn: 2,
    codigo_nbs: '106011100',
    codigo_tributacao_municipal: '160101',
    codigo_tributacao_nacional: '160201',
    data_competencia: ISSUED_ON_SAO_PAULO,
    descricao: 'Transporte rodoviario de cargas referente as notas 1234, 1235 e 1236.',
    incidencia_issqn: 'operacao_tributavel',
    issqn_retido: false,
    municipio: '3543402',
    pais: 'BR',
    tributos_aproximados: { aliquota_simples_nacional: 2 },
    valor_total: 2601.95,
  },
  tomador: {
    bairro: 'Centro',
    cep: '14010040',
    cidade: 'Ribeirão Preto',
    documento: '98765432000110',
    endereco: 'Avenida Jerônimo Gonçalves',
    estado: 'SP',
    nome: 'Comercial Exemplo Ltda',
    numero: '1000',
  },
} as const

export function payloadWith(
  overrides: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return { ...FROZEN_PAYLOAD, ...overrides }
}

export function payloadWithout(
  field: keyof typeof FROZEN_PAYLOAD,
): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(FROZEN_PAYLOAD).filter(([key]) => key !== field))
}

/** `POST /api/v3/nota/emitir` 200, exemplo do swagger. */
export function issuedBody(): Response {
  return jsonResponse({
    id_nota: Number(PROVIDER_DOCUMENT_ID),
    message: 'Pedido de emissão enviado com sucesso!',
    success: true,
  })
}

/** `409` do `hash_pedido` ainda ativo: devolve o `id_nota` da emissão original (doc do campo). */
export function duplicateRequestBody(): Response {
  return jsonResponse(
    {
      id_nota: Number(PROVIDER_DOCUMENT_ID),
      message: 'Pedido duplicado',
      success: false,
    },
    409,
  )
}

/** `ErrorResponse` do swagger: `{success:false, message, alert?, field?, errors?}`. */
export function errorBody(input: { message: string; status: number }): Response {
  return jsonResponse({ message: input.message, success: false }, input.status)
}

/** `422` do swagger, com a lista `errors[]`. */
export function validationErrorBody(): Response {
  return jsonResponse(
    {
      errors: [{ field: 'servico.codigo_tributacao_nacional', message: 'Campo inválido' }],
      message: 'Erro de validação',
      success: false,
    },
    422,
  )
}

/** `NotaListItem` do swagger, exemplo de nota com `status: "Sucesso"`. */
export function noteListItem(
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> {
  return {
    chave_acesso: 'ABC123XYZ789',
    cpf_cnpj: '12345678000190',
    data_competencia: '2024-01-15',
    data_emissao: '2024-01-15',
    id_nota: Number(PROVIDER_DOCUMENT_ID),
    nome_razao: 'Cliente Exemplo Ltda',
    numero: '123',
    status: 'Sucesso',
    valor_servicos: 1500,
    ...overrides,
  }
}

export function listBody(results: readonly Readonly<Record<string, unknown>>[]): Response {
  return jsonResponse({
    pagination: { more: false, page: 1, per_page: 10, total: results.length },
    results,
    success: true,
  })
}

/** `GET /api/v3/nota/pdf|xml` 200: o documento em base64 dentro do envelope. */
export function documentBody(bytes: Uint8Array): Response {
  return jsonResponse({ base64_file: Buffer.from(bytes).toString('base64'), success: true })
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status,
  })
}

export function textResponse(body: string, status = 200): Response {
  return new Response(body, { headers: { 'content-type': 'text/html' }, status })
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
        hasSignal: init.signal instanceof AbortSignal,
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

export function parseBody(call: FetchCall | undefined): unknown {
  return JSON.parse(call?.body ?? 'null')
}

/** Nenhum dos dois segredos pode atravessar para o outcome — nem dentro de mensagem. */
export function containsSecret(outcome: unknown): boolean {
  const serialized = JSON.stringify(outcome)
  return serialized.includes(API_TOKEN) || serialized.includes(CALLBACK_TOKEN)
}

export async function createNotaRpV3ClientFixture(input: {
  clock?: () => Date
  config?: Partial<NotaRpV3ConfigShape>
  fetch: FetchStub
}): Promise<NotaRpV3ClientShape> {
  const module = (await import('../../src/nfse-issuance/infrastructure/nota-rp-v3.client.js')) as {
    createNotaRpV3Client(dependencies: {
      clock: () => Date
      config: NotaRpV3ConfigShape
      fetch: FetchStub
    }): NotaRpV3ClientShape
  }

  return module.createNotaRpV3Client({
    clock: input.clock ?? ((): Date => ISSUED_AT),
    config: {
      baseUrl: BASE_URL_V2,
      callbackBaseUrl: CALLBACK_BASE_URL,
      callbackToken: CALLBACK_TOKEN,
      municipalRegistration: MUNICIPAL_REGISTRATION,
      taxId: COMPANY_TAX_ID,
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
