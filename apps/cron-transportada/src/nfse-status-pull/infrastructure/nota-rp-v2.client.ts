/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Cópia reduzida de `apps/worker-transportada/src/nfse-issuance/infrastructure/nota-rp-v2.client.ts`
 * — só consulta de situação e download de documento, que é o que a reconciliação usa. As apps não
 * importam código-fonte uma da outra; a paridade de leitura é comportamental e vive em
 * `test/nfse-status-pull/nota-rp-parity.contract.ts`. Mudou a interpretação de um lado? mude do
 * outro.
 *
 * ADR-0029: erro de negócio chega como HTTP 200 com `success:false` — quem decide é o corpo.
 * O formato de fio segue inferido até o T030 medir a API real.
 *
 * Nenhuma exceção escapa: toda falha vira `status: 'error'` com causa estável.
 */
const SITUATION = {
  authorized: 'autorizada',
  cancelled: 'cancelada',
  pending: 'processando',
  rejected: 'rejeitada',
} as const

const DOCUMENT_MEDIA_TYPE = {
  pdf: 'application/pdf',
  xml: 'application/xml',
} as const

const UNKNOWN_REJECTION_CODE = 'NOTA_RP_UNKNOWN'
const REDACTED = '[REDACTED]'
const JSON_MEDIA_TYPE = 'application/json'

export type NotaRpCause =
  | 'malformed_response'
  | 'timeout'
  | 'transport_failure'
  | 'unexpected_status'

export type NotaRpRejection = {
  readonly code: string
  readonly message: string
}

export type NotaRpStatusOutcome =
  | { readonly cancelledAt?: string; readonly status: 'cancelled' }
  | { readonly cause: NotaRpCause; readonly status: 'error' }
  | { readonly rejection: NotaRpRejection; readonly status: 'rejected' }
  | { readonly status: 'pending' }
  | {
      readonly document: {
        readonly authorizedAt: string
        readonly fiscalNumber: string
        readonly providerDocumentId: string
        readonly verificationCode: string
      }
      readonly status: 'authorized'
    }

export type NotaRpDocumentOutcome =
  | { readonly bytes: Uint8Array; readonly contentType: string; readonly status: 'ok' }
  | { readonly cause: NotaRpCause; readonly status: 'error' }
  | { readonly rejection: NotaRpRejection; readonly status: 'rejected' }

export type NotaRpV2Config = {
  readonly baseUrl: string
  /** Identifica **qual empresa** dentro da conta do token. Sem ela o provedor não sabe de quem se fala. */
  readonly municipalRegistration: string
  readonly timeoutMilliseconds: number
  readonly token: string
}

export type NotaRpFetch = (url: string, init: RequestInit) => Promise<Response>

export type NotaRpStatusClient = {
  fetchDocument(input: {
    readonly kind: 'pdf' | 'xml'
    readonly providerDocumentId: string
  }): Promise<NotaRpDocumentOutcome>
  fetchStatus(input: { readonly providerDocumentId: string }): Promise<NotaRpStatusOutcome>
}

export function createNotaRpStatusClient(dependencies: {
  readonly config: NotaRpV2Config
  readonly fetch: NotaRpFetch
}): NotaRpStatusClient {
  const { config } = dependencies

  const send = async (input: {
    readonly accept: string
    readonly url: string
  }): Promise<Response | NotaRpCause> => {
    try {
      const response = await dependencies.fetch(input.url, {
        headers: {
          accept: input.accept,
          'X-AUTH-IM': config.municipalRegistration,
          'X-AUTH-USER-TOKEN': config.token,
        },
        method: 'GET',
        signal: AbortSignal.timeout(config.timeoutMilliseconds),
      })
      return response.ok ? response : 'unexpected_status'
    } catch (error: unknown) {
      return classifyTransportError(error)
    }
  }

  return {
    async fetchDocument({ kind, providerDocumentId }) {
      const contentType = DOCUMENT_MEDIA_TYPE[kind]
      const response = await send({
        accept: contentType,
        url: `${config.baseUrl}/${kind}/${encodeURIComponent(providerDocumentId)}`,
      })
      if (typeof response === 'string') return { cause: response, status: 'error' }

      return readDocument({ contentType, response, token: config.token })
    },

    async fetchStatus({ providerDocumentId }) {
      const response = await send({
        accept: JSON_MEDIA_TYPE,
        url: `${config.baseUrl}/notas/?id_nota=${encodeURIComponent(providerDocumentId)}`,
      })
      if (typeof response === 'string') return { cause: response, status: 'error' }

      const envelope = await readEnvelope({ response, token: config.token })
      if (envelope.status !== 'ok') return envelope
      return readSituation(envelope.data)
    },
  }
}

type EnvelopeOutcome =
  | { readonly cause: NotaRpCause; readonly status: 'error' }
  | { readonly data: Record<string, unknown>; readonly status: 'ok' }
  | { readonly rejection: NotaRpRejection; readonly status: 'rejected' }

async function readEnvelope(input: {
  readonly response: Response
  readonly token: string
}): Promise<EnvelopeOutcome> {
  let body: unknown
  try {
    body = await input.response.json()
  } catch {
    return { cause: 'malformed_response', status: 'error' }
  }

  if (!isRecord(body)) return { cause: 'malformed_response', status: 'error' }

  if (body['success'] !== true) {
    return {
      rejection: {
        code: readText(body, 'code') ?? UNKNOWN_REJECTION_CODE,
        message: redact(readText(body, 'message') ?? '', input.token),
      },
      status: 'rejected',
    }
  }

  const data = body['data']
  return isRecord(data) ? { data, status: 'ok' } : { cause: 'malformed_response', status: 'error' }
}

function readSituation(data: Record<string, unknown>): NotaRpStatusOutcome {
  const situation = readText(data, 'situacao')

  if (situation === SITUATION.pending) return { status: 'pending' }

  if (situation === SITUATION.authorized) {
    const authorizedAt = readText(data, 'data_emissao')
    const fiscalNumber = readText(data, 'numero_nota')
    const verificationCode = readText(data, 'codigo_verificacao')
    const providerDocumentId = readText(data, 'id_nota')
    if (
      authorizedAt === undefined ||
      fiscalNumber === undefined ||
      verificationCode === undefined ||
      providerDocumentId === undefined
    ) {
      return { cause: 'malformed_response', status: 'error' }
    }
    return {
      document: { authorizedAt, fiscalNumber, providerDocumentId, verificationCode },
      status: 'authorized',
    }
  }

  if (situation === SITUATION.rejected) {
    const code = readText(data, 'codigo_erro')
    const message = readText(data, 'mensagem_erro')
    return code === undefined || message === undefined
      ? { cause: 'malformed_response', status: 'error' }
      : { rejection: { code, message }, status: 'rejected' }
  }

  if (situation === SITUATION.cancelled) {
    const cancelledAt = readText(data, 'data_cancelamento')
    return cancelledAt === undefined
      ? { status: 'cancelled' }
      : { cancelledAt, status: 'cancelled' }
  }

  /** Situação desconhecida nunca vira autorização por otimismo. */
  return { cause: 'malformed_response', status: 'error' }
}

async function readDocument(input: {
  readonly contentType: string
  readonly response: Response
  readonly token: string
}): Promise<NotaRpDocumentOutcome> {
  /** Envelope JSON onde se esperava documento é falha, nunca byte para arquivar. */
  if ((input.response.headers.get('content-type') ?? '').includes(JSON_MEDIA_TYPE)) {
    const envelope = await readEnvelope({ response: input.response, token: input.token })
    return envelope.status === 'rejected'
      ? envelope
      : { cause: 'malformed_response', status: 'error' }
  }

  let buffer: ArrayBuffer
  try {
    buffer = await input.response.arrayBuffer()
  } catch {
    return { cause: 'malformed_response', status: 'error' }
  }

  if (buffer.byteLength === 0) return { cause: 'malformed_response', status: 'error' }

  return {
    bytes: new Uint8Array(buffer),
    contentType: input.response.headers.get('content-type') ?? input.contentType,
    status: 'ok',
  }
}

function classifyTransportError(error: unknown): NotaRpCause {
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) {
    return 'timeout'
  }
  return 'transport_failure'
}

/** O token nunca volta numa mensagem: a prefeitura devolve o que recebeu, inclusive o cabeçalho. */
function redact(message: string, token: string): string {
  return token === '' ? message : message.split(token).join(REDACTED)
}

function readText(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key]
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
