/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */

/**
 * Adaptador HTTP da Nota RP v2. Duas coisas o definem:
 *
 * 1. **Erro de negócio chega como HTTP 200 com `success:false`** — quem decide é o corpo, não o
 *    status. Ler o status arquivaria uma rejeição da prefeitura como se fosse documento fiscal.
 * 2. **Nenhuma exceção escapa.** Exceção aqui derrubaria o consumidor antes do `markProcessed`, e
 *    a mensagem voltaria para a fila em laço.
 *
 * A leitura do envelope segue a coleção oficial da v2, conferida na Fase A2 de
 * `specs/040-nota-rp-autenticada/tasks.md` — a coleção não mora no repositório. Sucesso do `/emitir`
 * traz `id_nota` numérico **no topo**; a recusa é `{success:false, message}` e nada mais.
 * Segue **inferido** o vocabulário da consulta (`situacao`, `codigo_erro`): nenhum exemplo da
 * coleção cobre `/notas/`, e o acerto, quando vier, é aqui.
 */

const DOCUMENT_MEDIA_TYPE = {
  pdf: 'application/pdf',
  xml: 'application/xml',
} as const

const JSON_MEDIA_TYPE = 'application/json'
const REDACTED = '[REDACTED]'
const ROUTE_CANCEL = '/cancelar-nota'
const ROUTE_ISSUE = '/emitir'
const ROUTE_STATUS = '/notas/'
const STATUS_QUERY_PARAM = 'id_nota'
const UNKNOWN_REJECTION_CODE = 'NOTA_RP_UNKNOWN'

/** Vocabulário fechado: situação desconhecida vira `malformed_response`, nunca autorização. */
const SITUATION = {
  authorized: 'autorizada',
  cancelled: 'cancelada',
  pending: 'processando',
  rejected: 'rejeitada',
} as const

export type NotaRpCause =
  | 'malformed_response'
  | 'timeout'
  | 'transport_failure'
  | 'unexpected_status'

export type NotaRpDocumentKind = keyof typeof DOCUMENT_MEDIA_TYPE

export type NotaRpRejection = {
  readonly code: string
  readonly message: string
}

export type NotaRpAuthorizedDocument = {
  readonly authorizedAt: string
  readonly fiscalNumber: string
  readonly providerDocumentId: string
  readonly verificationCode: string
}

export type NotaRpIssueOutcome = {
  readonly cause?: NotaRpCause
  readonly providerDocumentId?: string
  readonly rejection?: NotaRpRejection
  readonly status: 'accepted' | 'error' | 'rejected'
}

export type NotaRpCancelOutcome = {
  readonly cause?: NotaRpCause
  readonly rejection?: NotaRpRejection
  readonly status: 'accepted' | 'error' | 'rejected'
}

export type NotaRpStatusOutcome = {
  readonly cancelledAt?: string
  readonly cause?: NotaRpCause
  readonly document?: NotaRpAuthorizedDocument
  readonly rejection?: NotaRpRejection
  readonly status: 'authorized' | 'cancelled' | 'error' | 'pending' | 'rejected'
}

export type NotaRpDocumentOutcome = {
  readonly bytes?: Uint8Array
  readonly cause?: NotaRpCause
  readonly contentType?: string
  readonly rejection?: NotaRpRejection
  readonly status: 'error' | 'ok' | 'rejected'
}

export type NotaRpV2Config = {
  readonly baseUrl: string
  /** Identifica **qual empresa** dentro da conta do token. Sem ela o provedor não sabe por quem emitir. */
  readonly municipalRegistration: string
  readonly timeoutMilliseconds: number
  readonly token: string
}

export type NotaRpFetch = (input: string, init: RequestInit) => Promise<Response>

export type NotaRpV2Client = {
  cancel(input: {
    readonly providerDocumentId: string
    readonly reason: string
  }): Promise<NotaRpCancelOutcome>
  fetchDocument(input: {
    readonly kind: NotaRpDocumentKind
    readonly providerDocumentId: string
  }): Promise<NotaRpDocumentOutcome>
  fetchStatus(input: { readonly providerDocumentId: string }): Promise<NotaRpStatusOutcome>
  issue(input: { readonly rps: Readonly<Record<string, unknown>> }): Promise<NotaRpIssueOutcome>
}

type Redact = (value: string) => string

type EnvelopeOutcome =
  | { readonly cause: NotaRpCause; readonly kind: 'error' }
  | { readonly data: Readonly<Record<string, unknown>>; readonly kind: 'data' }
  | { readonly kind: 'rejected'; readonly rejection: NotaRpRejection }

export function createNotaRpV2Client(dependencies: {
  readonly config: NotaRpV2Config
  readonly fetch: NotaRpFetch
}): NotaRpV2Client {
  const { config, fetch } = dependencies
  const baseUrl = config.baseUrl.replace(/\/+$/u, '')
  const redact: Redact = (value) =>
    config.token.length === 0 ? value : value.split(config.token).join(REDACTED)

  async function send(input: {
    readonly accept: string
    readonly body?: Readonly<Record<string, unknown>>
    readonly method: string
    readonly url: string
  }): Promise<NotaRpCause | Response> {
    try {
      const response = await fetch(input.url, {
        headers: buildHeaders({ accept: input.accept, hasBody: input.body !== undefined }),
        method: input.method,
        signal: AbortSignal.timeout(config.timeoutMilliseconds),
        ...(input.body === undefined ? {} : { body: JSON.stringify(input.body) }),
      })
      return response.ok ? response : 'unexpected_status'
    } catch (error: unknown) {
      return classifyTransportError(error)
    }
  }

  async function requestEnvelope(input: {
    readonly body?: Readonly<Record<string, unknown>>
    readonly method: string
    readonly url: string
  }): Promise<EnvelopeOutcome> {
    const sent = await send({ accept: JSON_MEDIA_TYPE, ...input })
    if (typeof sent === 'string') return { cause: sent, kind: 'error' }
    return readEnvelope({ redact, response: sent })
  }

  function buildHeaders(input: {
    readonly accept: string
    readonly hasBody: boolean
  }): HeadersInit {
    return {
      accept: input.accept,
      'X-AUTH-IM': config.municipalRegistration,
      'X-AUTH-USER-TOKEN': config.token,
      ...(input.hasBody ? { 'content-type': JSON_MEDIA_TYPE } : {}),
    }
  }

  return {
    cancel: async ({ providerDocumentId, reason }) => {
      const envelope = await requestEnvelope({
        body: { id_nota: providerDocumentId, motivo: reason },
        method: 'POST',
        url: `${baseUrl}${ROUTE_CANCEL}`,
      })
      if (envelope.kind === 'error') return { cause: envelope.cause, status: 'error' }
      if (envelope.kind === 'rejected') {
        return { rejection: envelope.rejection, status: 'rejected' }
      }
      return { status: 'accepted' }
    },

    fetchDocument: async ({ kind, providerDocumentId }) => {
      const sent = await send({
        accept: DOCUMENT_MEDIA_TYPE[kind],
        method: 'GET',
        url: `${baseUrl}/${kind}/${providerDocumentId}`,
      })
      if (typeof sent === 'string') return { cause: sent, status: 'error' }
      return readDocument({
        fallbackContentType: DOCUMENT_MEDIA_TYPE[kind],
        redact,
        response: sent,
      })
    },

    fetchStatus: async ({ providerDocumentId }) => {
      const url = new URL(`${baseUrl}${ROUTE_STATUS}`)
      url.searchParams.set(STATUS_QUERY_PARAM, providerDocumentId)
      const envelope = await requestEnvelope({ method: 'GET', url: url.toString() })
      if (envelope.kind === 'error') return { cause: envelope.cause, status: 'error' }
      if (envelope.kind === 'rejected') {
        return { rejection: envelope.rejection, status: 'rejected' }
      }
      /** Aqui a nota vem dentro de `data`; no `/emitir` o envelope é raso. Cada rota com a sua forma. */
      const data = asRecord(envelope.data['data'])
      if (data === undefined) return { cause: 'malformed_response', status: 'error' }
      return interpretSituation({ data, providerDocumentId, redact })
    },

    issue: async ({ rps }) => {
      const envelope = await requestEnvelope({
        body: rps,
        method: 'POST',
        url: `${baseUrl}${ROUTE_ISSUE}`,
      })
      if (envelope.kind === 'error') return { cause: envelope.cause, status: 'error' }
      if (envelope.kind === 'rejected') {
        return { rejection: envelope.rejection, status: 'rejected' }
      }
      const providerDocumentId = readIdentifier(envelope.data, 'id_nota')
      if (providerDocumentId === undefined) return { cause: 'malformed_response', status: 'error' }
      return { providerDocumentId, status: 'accepted' }
    },
  }
}

async function readEnvelope(input: {
  readonly redact: Redact
  readonly response: Response
}): Promise<EnvelopeOutcome> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await input.response.text())
  } catch {
    return { cause: 'malformed_response', kind: 'error' }
  }

  const envelope = asRecord(parsed)
  if (envelope === undefined || typeof envelope['success'] !== 'boolean') {
    return { cause: 'malformed_response', kind: 'error' }
  }
  if (!envelope['success']) {
    /**
     * A recusa da v2 é `{success:false, message}` e nada mais: código de erro só existe no postback,
     * dentro de `MensagemRetorno[].Codigo`. O nosso código é o marcador estável de "veio sem código".
     */
    return {
      kind: 'rejected',
      rejection: {
        code: UNKNOWN_REJECTION_CODE,
        message: input.redact(readText(envelope, 'message') ?? ''),
      },
    }
  }

  /** O envelope inteiro, não um `data` interno: no `/emitir` o `id_nota` vem no topo. */
  return { data: envelope, kind: 'data' }
}

/** Envelope JSON onde se esperava documento é falha — nunca byte para arquivar. */
async function readDocument(input: {
  readonly fallbackContentType: string
  readonly redact: Redact
  readonly response: Response
}): Promise<NotaRpDocumentOutcome> {
  const contentType = input.response.headers.get('content-type')
  if ((contentType ?? '').toLowerCase().includes('json')) {
    const envelope = await readEnvelope(input)
    if (envelope.kind === 'rejected') return { rejection: envelope.rejection, status: 'rejected' }
    return {
      cause: envelope.kind === 'error' ? envelope.cause : 'malformed_response',
      status: 'error',
    }
  }

  try {
    const bytes = new Uint8Array(await input.response.arrayBuffer())
    if (bytes.byteLength === 0) return { cause: 'malformed_response', status: 'error' }
    return { bytes, contentType: contentType ?? input.fallbackContentType, status: 'ok' }
  } catch {
    return { cause: 'malformed_response', status: 'error' }
  }
}

function interpretSituation(input: {
  readonly data: Readonly<Record<string, unknown>>
  readonly providerDocumentId: string
  readonly redact: Redact
}): NotaRpStatusOutcome {
  const situation = readText(input.data, 'situacao')

  if (situation === SITUATION.pending) return { status: 'pending' }

  if (situation === SITUATION.rejected) {
    return {
      rejection: {
        code: readText(input.data, 'codigo_erro') ?? UNKNOWN_REJECTION_CODE,
        message: input.redact(readText(input.data, 'mensagem_erro') ?? ''),
      },
      status: 'rejected',
    }
  }

  if (situation === SITUATION.cancelled) {
    const cancelledAt = readText(input.data, 'data_cancelamento')
    return { ...(cancelledAt === undefined ? {} : { cancelledAt }), status: 'cancelled' }
  }

  if (situation === SITUATION.authorized) return readAuthorized(input)

  return { cause: 'malformed_response', status: 'error' }
}

/** Autorização sem número, código de verificação ou data não é autorização arquivável. */
function readAuthorized(input: {
  readonly data: Readonly<Record<string, unknown>>
  readonly providerDocumentId: string
}): NotaRpStatusOutcome {
  const authorizedAt = readText(input.data, 'data_emissao')
  const fiscalNumber = readText(input.data, 'numero_nota')
  const verificationCode = readText(input.data, 'codigo_verificacao')
  if (authorizedAt === undefined || fiscalNumber === undefined || verificationCode === undefined) {
    return { cause: 'malformed_response', status: 'error' }
  }

  return {
    document: {
      authorizedAt,
      fiscalNumber,
      providerDocumentId: readText(input.data, 'id_nota') ?? input.providerDocumentId,
      verificationCode,
    },
    status: 'authorized',
  }
}

/** A mensagem do erro carrega URL e cabeçalho — só a classificação estável sai daqui. */
function classifyTransportError(error: unknown): NotaRpCause {
  if (!(error instanceof Error)) return 'transport_failure'
  return error.name === 'TimeoutError' || error.name === 'AbortError'
    ? 'timeout'
    : 'transport_failure'
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined
}

/** O `id_nota` viaja como número inteiro; guardá-lo como texto é o que o resto do trilho espera. */
function readIdentifier(
  record: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = record[key]
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) ? String(value) : undefined
  }
  return readText(record, key)
}

function readText(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = record[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}
