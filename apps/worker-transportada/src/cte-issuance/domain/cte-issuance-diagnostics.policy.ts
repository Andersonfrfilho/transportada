/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { createHash } from 'node:crypto'

import type { CteIssueOutcome } from '../infrastructure/cte-fiscal-gateway.js'

import { type CteUnknownErrorDescription, redactCteSecrets } from './cte-unknown-error.policy.js'

export const CTE_DIAGNOSTICS_RETENTION_DAYS = 30

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1_000
const REDACTED = '[REDACTED]'
const SECRET_KEY_PATTERN = /certificad|senha|password|secret|token|pfx|privatekey|authorization/i
const MAX_DEPTH = 6
const MAX_ARRAY_LENGTH = 50
const MAX_STRING_LENGTH = 2_000
const PREVIEW_LENGTH = 500

export type CteIssuanceDiagnosticsPhase = 'error' | 'request' | 'response'

export type CteIssuanceDiagnosticsRecord = {
  readonly attemptId: string
  readonly attemptKind: string
  readonly batchId: string
  readonly batchItemId: string
  readonly companyId: string
  readonly correlationId: string | undefined
  readonly durationMs: number | undefined
  readonly error: CteUnknownErrorDescription | undefined
  readonly eventId: string
  readonly expiresAt: Date
  readonly occurredAt: Date
  readonly phase: CteIssuanceDiagnosticsPhase
  readonly request: unknown
  readonly response: unknown
}

export type CteIssuanceDiagnostics = {
  record(input: CteIssuanceDiagnosticsRecord): Promise<void>
}

export type CteDocumentDigest = {
  readonly length: number
  readonly sha256: string
}

/**
 * Reproduzir a emissão exige o mesmo corpo que foi para a SEFAZ. O payload da tentativa é
 * regravado quando a numeração avança, então o diagnóstico guarda a cópia do que saiu de fato —
 * menos certificado e senha, que nunca podem sair da memória do worker.
 */
export function buildCteDiagnosticsRequest(input: {
  readonly command: {
    readonly cteData: unknown
    readonly documentId: string
    readonly tenantId: string
  }
  readonly config: Readonly<Record<string, unknown>>
}): Record<string, unknown> {
  return {
    config: redactCteDiagnosticsValue(input.config),
    cteData: redactCteDiagnosticsValue(input.command.cteData),
    documentId: input.command.documentId,
    tenantId: input.command.tenantId,
  }
}

/** O código de rejeição sozinho não diz qual campo a SEFAZ condenou: quem diz é a resposta crua. */
export function buildCteDiagnosticsResponse(outcome: CteIssueOutcome): Record<string, unknown> {
  return {
    status: outcome.status,
    ...(outcome.accessKey === undefined ? {} : { accessKey: outcome.accessKey }),
    ...(outcome.authorizedXml === undefined
      ? {}
      : { authorizedXml: digestCteDocument(outcome.authorizedXml) }),
    ...(outcome.cause === undefined ? {} : { cause: outcome.cause }),
    ...(outcome.protocol === undefined ? {} : { protocol: outcome.protocol }),
    ...(outcome.raw === undefined ? {} : { raw: redactCteDiagnosticsValue(outcome.raw) }),
    ...(outcome.rejection === undefined ? {} : { rejection: outcome.rejection }),
  }
}

/** O XML autorizado já está no object storage: aqui basta o digest para provar que é o mesmo. */
export function digestCteDocument(xml: string): CteDocumentDigest {
  return {
    length: xml.length,
    sha256: createHash('sha256').update(xml).digest('hex'),
  }
}

export function resolveCteDiagnosticsExpiry(input: {
  readonly occurredAt: Date
  readonly retentionDays?: number
}): Date {
  const retentionDays = input.retentionDays ?? CTE_DIAGNOSTICS_RETENTION_DAYS

  return new Date(input.occurredAt.getTime() + retentionDays * DAY_IN_MILLISECONDS)
}

/**
 * A resposta do provedor é valor desconhecido: pode trazer o XML assinado inteiro, o PFX em base64
 * ou o token da fila. Varre em profundidade, apaga por nome de campo e resume texto longo.
 */
export function redactCteDiagnosticsValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return REDACTED
  if (typeof value === 'string') return redactString(value)
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_LENGTH)
      .map((item: unknown) => redactCteDiagnosticsValue(item, depth + 1))
  }
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (typeof value !== 'object' || value === null) return value

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]: [string, unknown]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? REDACTED : redactCteDiagnosticsValue(entry, depth + 1),
    ]),
  )
}

function redactString(value: string): string {
  const redacted = redactCteSecrets(value)
  if (redacted.length <= MAX_STRING_LENGTH) return redacted

  const digest = digestCteDocument(value)

  return `${redacted.slice(0, PREVIEW_LENGTH)}…[truncado ${digest.length} chars sha256:${digest.sha256}]`
}
