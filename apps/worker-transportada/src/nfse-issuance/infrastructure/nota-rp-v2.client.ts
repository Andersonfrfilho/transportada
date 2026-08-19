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
 * A consulta (`GET /notas/`) foi **medida em produção** em 19/08/2026, contra a nota 5253521: a
 * resposta é `{success:true, results:[nota]}`, e a nota traz `Status`, `Nfse`, `DataEmissao` e uma
 * lista `Erro[]` de `{Codigo, Mensagem}`. O vocabulário anterior (`data`, `situacao`, `codigo_erro`)
 * era inferido e nunca existiu: toda consulta caía em `malformed_response` e **nenhuma NFS-e
 * liquidava**, nem autorizada nem rejeitada.
 *
 * O que a medição cobriu foi a nota reprovada (`Status: "Falha"`). Autorização e cancelamento seguem
 * lidos pelo mesmo formato, com o vocabulário de `Status` aberto às formas equivalentes; o que os
 * ancora é o **fato**, não o rótulo — `Erro[]` preenchida é recusa, e autorização sem número, data e
 * código de verificação não é autorização arquivável.
 */
import type { NfseCancellationMotive } from '../../database/nfse-issuance-execution.schema.js'
import { resolveNfseDocumentBytes } from '../domain/nfse-document-payload.policy.js'

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

/**
 * Vocabulário do campo `Status` da consulta, comparado sem acento e em caixa baixa. Status fora da
 * tabela vira `malformed_response`, nunca autorização por otimismo.
 */
const STATUS_VOCABULARY = {
  authorized: ['autorizada', 'autorizado', 'emitida', 'emitido', 'concluida', 'sucesso'],
  cancelled: ['cancelada', 'cancelado'],
  pending: ['processando', 'em processamento', 'pendente', 'aguardando', 'enviada', 'enviado'],
  rejected: ['falha', 'rejeitada', 'rejeitado', 'erro', 'negada'],
} as const

const DOCUMENT_FILE_FIELD = 'base64_file'
const RESULTS_FIELD = 'results'
/** `Nfse: "0"` é a nota que ainda não ganhou número — presença aqui não é autorização. */
const ABSENT_FISCAL_NUMBER = '0'

export type NotaRpCause =
  | 'malformed_response'
  | 'not_found'
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
  /**
   * O **segundo** segredo do pedido. O cliente não o usa para autenticar nada: ele chega aqui só
   * para ser redigido, porque viaja dentro da `CallbackUrl` no corpo do `/emitir` e a recusa de
   * validação devolve o campo recusado na `message`.
   */
  readonly callbackToken: string
  /** Identifica **qual empresa** dentro da conta do token. Sem ela o provedor não sabe por quem emitir. */
  readonly municipalRegistration: string
  readonly timeoutMilliseconds: number
  readonly token: string
}

export type NotaRpFetch = (input: string, init: RequestInit) => Promise<Response>

export type NotaRpV2Client = {
  cancel(input: {
    readonly cancellationMotive: NfseCancellationMotive
    readonly providerDocumentId: string
  }): Promise<NotaRpCancelOutcome>
  fetchDocument(input: {
    readonly kind: NotaRpDocumentKind
    readonly providerDocumentId: string
  }): Promise<NotaRpDocumentOutcome>
  fetchStatus(input: { readonly providerDocumentId: string }): Promise<NotaRpStatusOutcome>
  issue(input: { readonly rps: Readonly<Record<string, unknown>> }): Promise<NotaRpIssueOutcome>
}

type Redact = (value: string) => string

/** Nota da consulta com as chaves em caixa baixa — ver `normalizeKeys`. */
type NormalizedNote = Readonly<Record<string, unknown>>

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
  /** Vazio não é segredo: cortá-lo partiria a mensagem inteira entre `[REDACTED]`. */
  const secrets = [config.token, config.callbackToken].filter((secret) => secret.length > 0)
  const redact: Redact = (value) =>
    secrets.reduce((redacted, secret) => redacted.split(secret).join(REDACTED), value)

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
    /**
     * `motivo` é código, não texto: a v2 lê `2` (serviço não prestado) e `4` (nota duplicada). Texto
     * livre ali faz a prefeitura recusar o cancelamento, e a recusa só aparece na consulta seguinte.
     * `id_nota` sai como veio — o provedor documenta número, e um `Number()` cego viraria `NaN`.
     */
    cancel: async ({ cancellationMotive, providerDocumentId }) => {
      const envelope = await requestEnvelope({
        body: { id_nota: providerDocumentId, motivo: cancellationMotive },
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
        kind,
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
      /**
       * A consulta devolve `results[]`; no `/emitir` o envelope é raso, com `id_nota` no topo. Cada
       * rota com a sua forma.
       */
      const note = readFirstResult(envelope.data)
      if (note === undefined) return { cause: readMissingCause(envelope.data), status: 'error' }
      return interpretNote({ note, providerDocumentId, redact })
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
  readonly kind: NotaRpDocumentKind
  readonly redact: Redact
  readonly response: Response
}): Promise<NotaRpDocumentOutcome> {
  const contentType = input.response.headers.get('content-type')
  /**
   * O documento chega **dentro de um envelope JSON**: medido em produção em 19/08/2026 (nota
   * 5254907), `/xml` e `/pdf` respondem `application/json` com `{success:true, base64_file}`, e o
   * corpo cru nunca aparece. Recusar o envelope inteiro adiava para sempre a nota já autorizada.
   */
  if ((contentType ?? '').toLowerCase().includes('json')) {
    const envelope = await readEnvelope(input)
    if (envelope.kind === 'rejected') return { rejection: envelope.rejection, status: 'rejected' }
    if (envelope.kind === 'error') return { cause: envelope.cause, status: 'error' }
    return readEnvelopedDocument({
      contentType: input.fallbackContentType,
      envelope: envelope.data,
      kind: input.kind,
    })
  }

  try {
    const raw = new Uint8Array(await input.response.arrayBuffer())
    if (raw.byteLength === 0) return { cause: 'malformed_response', status: 'error' }

    const bytes = resolveNfseDocumentBytes({ bytes: raw, kind: input.kind })
    if (bytes === undefined) return { cause: 'malformed_response', status: 'error' }

    return { bytes, contentType: contentType ?? input.fallbackContentType, status: 'ok' }
  } catch {
    return { cause: 'malformed_response', status: 'error' }
  }
}

/** O documento vem em base64 dentro de `base64_file`; a assinatura ainda decide se é documento. */
function readEnvelopedDocument(input: {
  readonly contentType: string
  readonly envelope: Readonly<Record<string, unknown>>
  readonly kind: NotaRpDocumentKind
}): NotaRpDocumentOutcome {
  const encoded = readText(normalizeKeys(input.envelope), DOCUMENT_FILE_FIELD)
  if (encoded === undefined) return { cause: 'malformed_response', status: 'error' }

  const bytes = resolveNfseDocumentBytes({
    bytes: new TextEncoder().encode(encoded),
    kind: input.kind,
  })
  if (bytes === undefined) return { cause: 'malformed_response', status: 'error' }

  return { bytes, contentType: input.contentType, status: 'ok' }
}

function interpretNote(input: {
  readonly note: NormalizedNote
  readonly providerDocumentId: string
  readonly redact: Redact
}): NotaRpStatusOutcome {
  const status = normalizeStatus(readText(input.note, 'status') ?? '')
  const rejection = readRejection(input)

  /** A recusa da prefeitura vem em `Erro[]`, e ela vale mesmo se o `Status` for desconhecido. */
  if (rejection !== undefined) return { rejection, status: 'rejected' }

  if (matches('pending', status)) return { status: 'pending' }

  if (matches('cancelled', status)) {
    const cancelledAt = readText(input.note, 'datacancelamento')
    return { ...(cancelledAt === undefined ? {} : { cancelledAt }), status: 'cancelled' }
  }

  if (matches('rejected', status)) {
    return {
      rejection: {
        code: UNKNOWN_REJECTION_CODE,
        message: input.redact(readText(input.note, 'mensagem') ?? status),
      },
      status: 'rejected',
    }
  }

  if (matches('authorized', status)) return readAuthorized(input)

  return { cause: 'malformed_response', status: 'error' }
}

/** Autorização sem número, código de verificação ou data não é autorização arquivável. */
function readAuthorized(input: {
  readonly note: NormalizedNote
  readonly providerDocumentId: string
}): NotaRpStatusOutcome {
  const authorizedAt = readText(input.note, 'dataemissao')
  const fiscalNumber = readText(input.note, 'nfse')
  const verificationCode = readVerificationCode(input.note)
  if (
    authorizedAt === undefined ||
    fiscalNumber === undefined ||
    fiscalNumber === ABSENT_FISCAL_NUMBER ||
    verificationCode === undefined
  ) {
    return { cause: 'malformed_response', status: 'error' }
  }

  return {
    document: {
      authorizedAt,
      fiscalNumber,
      providerDocumentId: readIdentifier(input.note, 'id_nota') ?? input.providerDocumentId,
      verificationCode,
    },
    status: 'authorized',
  }
}

/**
 * Medido em produção em 19/08/2026 (nota 5254907, `Status: "Sucesso"`): o corpo não traz
 * `CodigoVerificacao` como campo próprio — o código sai como último segmento de `Link`
 * (`.../nota/{id}/{numero}/{codigo}`), a URL pública de verificação que a prefeitura publica.
 */
function readVerificationCode(note: NormalizedNote): string | undefined {
  const direct = readText(note, 'codigoverificacao')
  if (direct !== undefined) return direct

  const link = readText(note, 'link')
  if (link === undefined) return undefined

  const segments = link.split('/').filter((segment) => segment.length > 0)
  return segments.at(-1)
}

/** O primeiro erro é o que o operador lê; os demais repetem o mesmo pedido de correção. */
function readRejection(input: {
  readonly note: NormalizedNote
  readonly redact: Redact
}): NotaRpRejection | undefined {
  const errors = input.note['erro']
  if (!Array.isArray(errors)) return undefined

  const entries = errors
    .map(asRecord)
    .filter((entry) => entry !== undefined)
    .map((entry) => normalizeKeys(entry))
  const [first] = entries
  if (first === undefined) return undefined

  return {
    code: readText(first, 'codigo') ?? UNKNOWN_REJECTION_CODE,
    message: input.redact(describeRejection(entries)),
  }
}

/**
 * A nota 5253521 voltou recusada por dois motivos ao mesmo tempo (`E215` e `E227`). Guardar só o
 * primeiro custa uma rodada de emissão fiscal por erro escondido: o operador corrige o cadastro,
 * reemite, e só então descobre o seguinte. Com um erro só a mensagem sai limpa, porque ela já viaja
 * ao lado do `code`; com mais de um, cada motivo leva o código dele.
 */
function describeRejection(entries: readonly NormalizedNote[]): string {
  const [first] = entries
  if (first === undefined) return ''
  if (entries.length === 1) return readText(first, 'mensagem') ?? ''

  return entries
    .map((entry) => {
      const message = readText(entry, 'mensagem') ?? ''
      const code = readText(entry, 'codigo')
      return code === undefined ? message : `${code}: ${message}`
    })
    .filter((described) => described.length > 0)
    .join(' · ')
}

function matches(vocabulary: keyof typeof STATUS_VOCABULARY, status: string): boolean {
  return STATUS_VOCABULARY[vocabulary].some((known) => known === status)
}

/** `"Falha"`, `"AUTORIZADA"` e `"Cancelada"` são o mesmo campo com a caixa de quem digitou. */
function normalizeStatus(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLowerCase()
}

/**
 * A consulta mistura caixas no mesmo corpo (`id_nota` ao lado de `Status` e `Nfse`). Ler por chave
 * normalizada tira a grafia do caminho crítico: campo novo em caixa diferente não vira nota travada.
 */
function normalizeKeys(record: Readonly<Record<string, unknown>>): NormalizedNote {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]),
  )
}

function readFirstResult(envelope: Readonly<Record<string, unknown>>): NormalizedNote | undefined {
  const results = envelope[RESULTS_FIELD]
  if (!Array.isArray(results)) return undefined

  const first = asRecord(results[0])
  return first === undefined ? undefined : normalizeKeys(first)
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

/**
 * Nota inexistente vem como sucesso com `results` vazia, ou só com a `message` da busca vazia — é
 * ausência, e não resposta quebrada. Sem mensagem e sem lista não há o que distinguir, e o envelope
 * volta a ser malformado.
 */
function readMissingCause(envelope: Readonly<Record<string, unknown>>): NotaRpCause {
  if (Array.isArray(envelope[RESULTS_FIELD])) return 'not_found'
  return readText(envelope, 'message') === undefined ? 'malformed_response' : 'not_found'
}

function readText(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = record[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}
