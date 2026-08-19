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
 *
 * A consulta foi **medida em produção** em 19/08/2026: `{success:true, results:[nota]}`, e a nota
 * traz `Status`, `Nfse`, `DataEmissao` e `Erro[]` de `{Codigo, Mensagem}`. O vocabulário anterior
 * (`data`, `situacao`) era inferido e nunca existiu — toda consulta virava `malformed_response` e
 * nenhuma NFS-e liquidava.
 *
 * Nenhuma exceção escapa: toda falha vira `status: 'error'` com causa estável.
 */
import {
  resolveNfseDocumentBytes,
  type NfseDocumentKind,
} from '../domain/nfse-document-payload.policy.js'

/** Comparado sem acento e em caixa baixa; status fora da tabela nunca vira autorização. */
const STATUS_VOCABULARY = {
  authorized: ['autorizada', 'autorizado', 'emitida', 'emitido', 'concluida'],
  cancelled: ['cancelada', 'cancelado'],
  pending: ['processando', 'em processamento', 'pendente', 'aguardando', 'enviada', 'enviado'],
  rejected: ['falha', 'rejeitada', 'rejeitado', 'erro', 'negada'],
} as const

const RESULTS_FIELD = 'results'
/** `Nfse: "0"` é a nota que ainda não ganhou número — presença aqui não é autorização. */
const ABSENT_FISCAL_NUMBER = '0'

const DOCUMENT_MEDIA_TYPE = {
  pdf: 'application/pdf',
  xml: 'application/xml',
} as const

const UNKNOWN_REJECTION_CODE = 'NOTA_RP_UNKNOWN'
const REDACTED = '[REDACTED]'
const JSON_MEDIA_TYPE = 'application/json'

export type NotaRpCause =
  | 'malformed_response'
  | 'not_found'
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

      return readDocument({ contentType, kind, response, token: config.token })
    },

    async fetchStatus({ providerDocumentId }) {
      const response = await send({
        accept: JSON_MEDIA_TYPE,
        url: `${config.baseUrl}/notas/?id_nota=${encodeURIComponent(providerDocumentId)}`,
      })
      if (typeof response === 'string') return { cause: response, status: 'error' }

      const envelope = await readEnvelope({ response, token: config.token })
      if (envelope.status !== 'ok') return envelope
      return readNote({ envelope: envelope.data, providerDocumentId, token: config.token })
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
    /*
     * A recusa da v2 é `{success:false, message}` e nada mais: código de erro só existe no postback,
     * dentro de `MensagemRetorno[].Codigo`. Ler um `code` daqui era inferência, e ela divergia do
     * cliente do worker, que não lê.
     */
    return {
      rejection: {
        code: UNKNOWN_REJECTION_CODE,
        message: redact(readText(body, 'message') ?? '', input.token),
      },
      status: 'rejected',
    }
  }

  return { data: body, status: 'ok' }
}

/**
 * Nota inexistente vem como sucesso com `results` vazia, ou só com a `message` da busca vazia — é
 * ausência, e não resposta quebrada. Sem lista e sem mensagem não há o que distinguir.
 */
function readMissingCause(body: Record<string, unknown>): NotaRpCause {
  if (Array.isArray(body[RESULTS_FIELD])) return 'not_found'
  return readText(body, 'message') === undefined ? 'malformed_response' : 'not_found'
}

function readNote(input: {
  readonly envelope: Record<string, unknown>
  readonly providerDocumentId: string
  readonly token: string
}): NotaRpStatusOutcome {
  const results = input.envelope[RESULTS_FIELD]
  if (!Array.isArray(results)) return { cause: readMissingCause(input.envelope), status: 'error' }

  const first = results.find((entry) => isRecord(entry))
  if (!isRecord(first)) return { cause: readMissingCause(input.envelope), status: 'error' }

  return interpretNote({ ...input, note: normalizeKeys(first) })
}

function interpretNote(input: {
  readonly note: Record<string, unknown>
  readonly providerDocumentId: string
  readonly token: string
}): NotaRpStatusOutcome {
  const status = normalizeStatus(readText(input.note, 'status') ?? '')
  const rejection = readRejection(input)

  /** A recusa da prefeitura vem em `Erro[]`, e ela vale mesmo se o `Status` for desconhecido. */
  if (rejection !== undefined) return { rejection, status: 'rejected' }

  if (matches('pending', status)) return { status: 'pending' }

  if (matches('cancelled', status)) {
    const cancelledAt = readText(input.note, 'datacancelamento')
    return cancelledAt === undefined
      ? { status: 'cancelled' }
      : { cancelledAt, status: 'cancelled' }
  }

  if (matches('rejected', status)) {
    return {
      rejection: {
        code: UNKNOWN_REJECTION_CODE,
        message: redact(readText(input.note, 'mensagem') ?? status, input.token),
      },
      status: 'rejected',
    }
  }

  if (matches('authorized', status)) return readAuthorized(input)

  return { cause: 'malformed_response', status: 'error' }
}

/** Autorização sem número, data ou código de verificação não é autorização arquivável. */
function readAuthorized(input: {
  readonly note: Record<string, unknown>
  readonly providerDocumentId: string
}): NotaRpStatusOutcome {
  const authorizedAt = readText(input.note, 'dataemissao')
  const fiscalNumber = readText(input.note, 'nfse')
  const verificationCode = readText(input.note, 'codigoverificacao')
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
      providerDocumentId: readText(input.note, 'id_nota') ?? input.providerDocumentId,
      verificationCode,
    },
    status: 'authorized',
  }
}

/** O primeiro erro é o que o operador lê; os demais repetem o mesmo pedido de correção. */
function readRejection(input: {
  readonly note: Record<string, unknown>
  readonly token: string
}): NotaRpRejection | undefined {
  const errors = input.note['erro']
  if (!Array.isArray(errors)) return undefined

  const entries = errors.filter((entry) => isRecord(entry)).map((entry) => normalizeKeys(entry))
  const [first] = entries
  if (first === undefined) return undefined

  return {
    code: readText(first, 'codigo') ?? UNKNOWN_REJECTION_CODE,
    message: redact(describeRejection(entries), input.token),
  }
}

/**
 * A nota 5253521 voltou recusada por dois motivos ao mesmo tempo (`E215` e `E227`). Guardar só o
 * primeiro custa uma rodada de emissão fiscal por erro escondido. Com um erro só a mensagem sai
 * limpa, porque ela já viaja ao lado do `code`; com mais de um, cada motivo leva o código dele.
 */
function describeRejection(entries: readonly Record<string, unknown>[]): string {
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
 * normalizada tira a grafia do caminho crítico.
 */
function normalizeKeys(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]),
  )
}

async function readDocument(input: {
  readonly contentType: string
  readonly kind: NfseDocumentKind
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

  const bytes = resolveNfseDocumentBytes({ bytes: new Uint8Array(buffer), kind: input.kind })
  if (bytes === undefined) return { cause: 'malformed_response', status: 'error' }

  return {
    bytes,
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
