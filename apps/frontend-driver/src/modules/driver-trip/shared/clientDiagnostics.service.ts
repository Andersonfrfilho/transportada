/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  DIAGNOSTIC_EVENT_KINDS,
  DIAGNOSTIC_FAILURE_KINDS,
  DIAGNOSTIC_STEPS,
} from './clientDiagnostics.constant'
import type {
  DeviceProfile,
  DiagnosticEvent,
  DiagnosticFailureKind,
  DiagnosticInput,
  DiagnosticsBatch,
  DiagnosticsSendResult,
} from './clientDiagnostics.types'

export const DIAGNOSTICS_BUFFER_LIMIT = 50
export const DIAGNOSTICS_BATCH_LIMIT = 20

/** Espelha o `.strict()` da rota: evento fora destes limites faria a API recusar o lote inteiro. */
const EVENT_KINDS: ReadonlySet<string> = new Set(DIAGNOSTIC_EVENT_KINDS)
const STEPS: ReadonlySet<string> = new Set(DIAGNOSTIC_STEPS)
const MAX_DURATION_MS = 600_000
const MAX_ATTEMPT = 10_000
const MAX_PHOTO_BYTES = 50 * 1024 * 1024
const MIN_HTTP_STATUS = 100
const MAX_HTTP_STATUS = 599
const MAX_KEY_LENGTH = 128
const OPAQUE_KEY_PATTERN = /^[A-Za-z0-9_-]+$/u
const REPORT_KIND_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u
const FAILURE_KINDS: ReadonlySet<DiagnosticFailureKind> = new Set(DIAGNOSTIC_FAILURE_KINDS)
/** Quem falhou foi o caminho: o mesmo lote pode passar depois. Os demais 4xx nunca passariam. */
const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([408, 429])

export type ClientDiagnostics = Readonly<{
  flush: () => Promise<void>
  record: (event: DiagnosticInput) => void
}>

export type ClientDiagnosticsParams = Readonly<{
  device?: DeviceProfile | undefined
  now?: (() => Date) | undefined
  send: (batch: DiagnosticsBatch) => Promise<DiagnosticsSendResult>
}>

/**
 * Spec 254 RF5: best-effort. `record` é síncrono e nunca lança; `flush` nunca propaga; nada aqui entra
 * na fila nem conta em `attempts`, e o coletor jamais registra evento sobre o próprio envio.
 */
export function createClientDiagnostics(params: ClientDiagnosticsParams): ClientDiagnostics {
  let buffer: readonly DiagnosticEvent[] = []

  function keepNewest(events: readonly DiagnosticEvent[]): readonly DiagnosticEvent[] {
    return events.slice(-DIAGNOSTICS_BUFFER_LIMIT)
  }

  return {
    async flush() {
      if (buffer.length === 0) return
      const events = buffer.slice(0, DIAGNOSTICS_BATCH_LIMIT)
      buffer = buffer.slice(events.length)
      try {
        const result = await params.send({
          ...(params.device === undefined ? {} : { device: params.device }),
          events,
        })
        if (!shouldKeepBatch(result.status)) return
      } catch {
        // Sem rede ou envio quebrado: os eventos esperam o próximo contato.
      }
      buffer = keepNewest([...events, ...buffer])
    },
    record(event) {
      try {
        const sanitized = sanitizeEvent(event)
        if (sanitized === undefined) return
        const occurredAt = (params.now ?? (() => new Date()))().toISOString()
        buffer = keepNewest([...buffer, { ...sanitized, occurredAt }])
      } catch {
        // Diagnóstico nunca derruba a baixa.
      }
    },
  }
}

function shouldKeepBatch(status: number): boolean {
  return status >= 500 || RETRYABLE_STATUSES.has(status)
}

/** Lista fechada de campos (RF4): o que o chamador mandar fora dela é descartado. */
function sanitizeEvent(event: unknown): DiagnosticInput | undefined {
  if (typeof event !== 'object' || event === null || Array.isArray(event)) return undefined
  const source = event as Record<string, unknown>
  const { eventKind, step } = source
  if (typeof eventKind !== 'string' || !EVENT_KINDS.has(eventKind)) return undefined
  if (typeof step !== 'string' || !STEPS.has(step)) return undefined

  const { failureKind } = source
  return {
    eventKind: eventKind as DiagnosticInput['eventKind'],
    step,
    ...pickInteger({ key: 'attempt', max: MAX_ATTEMPT, min: 0, source }),
    ...pickInteger({ key: 'durationMs', max: MAX_DURATION_MS, min: 0, source, shouldClamp: true }),
    ...pickInteger({ key: 'httpStatus', max: MAX_HTTP_STATUS, min: MIN_HTTP_STATUS, source }),
    ...pickInteger({ key: 'photoBytes', max: MAX_PHOTO_BYTES, min: 0, source }),
    ...pickString({ key: 'attachmentKey', pattern: OPAQUE_KEY_PATTERN, source }),
    ...pickString({ key: 'idempotencyKey', pattern: OPAQUE_KEY_PATTERN, source }),
    ...pickString({ key: 'reportKind', pattern: REPORT_KIND_PATTERN, source }),
    ...(typeof failureKind === 'string' && FAILURE_KINDS.has(failureKind as DiagnosticFailureKind)
      ? { failureKind: failureKind as DiagnosticFailureKind }
      : {}),
  }
}

type PickIntegerParams = Readonly<{
  key: string
  max: number
  min: number
  shouldClamp?: boolean
  source: Record<string, unknown>
}>

function pickInteger(params: PickIntegerParams): Record<string, number> {
  const value = params.source[params.key]
  if (typeof value !== 'number' || !Number.isFinite(value)) return {}
  const rounded = Math.round(value)
  if (params.shouldClamp === true) {
    return { [params.key]: Math.min(Math.max(rounded, params.min), params.max) }
  }
  return rounded >= params.min && rounded <= params.max ? { [params.key]: rounded } : {}
}

type PickStringParams = Readonly<{
  key: string
  pattern: RegExp
  source: Record<string, unknown>
}>

function pickString(params: PickStringParams): Record<string, string> {
  const value = params.source[params.key]
  const isValid =
    typeof value === 'string' && value.length <= MAX_KEY_LENGTH && params.pattern.test(value)
  return isValid ? { [params.key]: value } : {}
}
