/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { NotaRpCause, NotaRpRejection } from './nota-rp-v2.client.js'
import type { NotaRpV3EnvelopeOutcome, NotaRpV3Redact } from './nota-rp-v3.types.js'

const REDACTED = '[REDACTED]'
const UNKNOWN_REJECTION_CODE = 'NOTA_RP_UNKNOWN'
const HTTP_REJECTION_CODE_PREFIX = 'NOTA_RP_HTTP_'
const REJECTION_MESSAGE_LIMIT = 500
/** 4xx que é pressão do servidor, não defeito do pedido: nunca vira recusa. */
const RETRYABLE_CLIENT_ERROR_STATUSES: ReadonlySet<number> = new Set([408, 425, 429])

export function createRedact(secrets: readonly string[]): NotaRpV3Redact {
  const present = secrets.filter((secret) => secret.length > 0)
  return (value) =>
    present.reduce((redacted, secret) => redacted.split(secret).join(REDACTED), value)
}

export function classifyTransportError(error: unknown): NotaRpCause {
  if (!(error instanceof Error)) return 'transport_failure'
  return error.name === 'TimeoutError' || error.name === 'AbortError'
    ? 'timeout'
    : 'transport_failure'
}

export function isRejectableClientError(status: number): boolean {
  return status >= 400 && status < 500 && !RETRYABLE_CLIENT_ERROR_STATUSES.has(status)
}

export function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined
}

export function readText(
  record: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = record[key]
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

/** Texto ou inteiro seguro: `id_nota` e `numero` chegam como um ou outro. */
export function readIdentifier(
  record: Readonly<Record<string, unknown>>,
  key: string,
): string | undefined {
  const value = record[key]
  if (typeof value === 'number') return Number.isSafeInteger(value) ? String(value) : undefined
  return readText(record, key)
}

export function buildRejection(input: {
  readonly code: string
  readonly message: string
  readonly redact: NotaRpV3Redact
}): NotaRpRejection {
  return {
    code: input.code,
    message: input.redact(input.message).slice(0, REJECTION_MESSAGE_LIMIT),
  }
}

export async function readJson(response: Response): Promise<unknown> {
  try {
    return JSON.parse(await response.text())
  } catch {
    return undefined
  }
}

function describeFieldErrors(body: Readonly<Record<string, unknown>> | undefined): string {
  const items = Array.isArray(body?.['errors']) ? (body['errors'] as readonly unknown[]) : []
  return items
    .map((item) => asRecord(item))
    .map((item) => {
      if (item === undefined) return ''
      const field = readText(item, 'field')
      const reason = readText(item, 'message')
      return [field, reason].filter((part) => part !== undefined).join(': ')
    })
    .filter((line) => line.length > 0)
    .join('; ')
}

export async function readHttpRejection(input: {
  readonly redact: NotaRpV3Redact
  readonly response: Response
}): Promise<NotaRpRejection> {
  const code = `${HTTP_REJECTION_CODE_PREFIX}${input.response.status}`
  const fallback = `HTTP ${input.response.status}`
  const body = asRecord(await readJson(input.response))
  const message = body?.['message']
  const text = typeof message === 'string' ? message.trim() : ''
  const details = describeFieldErrors(body)
  const headline = text.length === 0 ? fallback : text
  return buildRejection({
    code,
    message: details.length === 0 ? headline : `${headline} — ${details}`,
    redact: input.redact,
  })
}

export async function readEnvelope(input: {
  readonly redact: NotaRpV3Redact
  readonly response: Response
}): Promise<NotaRpV3EnvelopeOutcome> {
  const envelope = asRecord(await readJson(input.response))
  if (envelope === undefined || typeof envelope['success'] !== 'boolean') {
    return { cause: 'malformed_response', kind: 'error' }
  }
  if (envelope['success']) return { data: envelope, kind: 'data' }

  return {
    kind: 'rejected',
    rejection: buildRejection({
      code: UNKNOWN_REJECTION_CODE,
      message: readText(envelope, 'message') ?? '',
      redact: input.redact,
    }),
  }
}
