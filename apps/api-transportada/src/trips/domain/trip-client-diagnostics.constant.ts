/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 254: o diagnóstico do app do motorista é só log, sem tabela. Enums e limites moram aqui para
 * a rota (validação) e o caso de uso (lista permitida) lerem a mesma fonte.
 */
export const DRIVER_CLIENT_DIAGNOSTIC_LOG_MESSAGE = 'driver_client_diagnostic'
export const CLIENT_DIAGNOSTICS_INVALID_CODE = 'CLIENT_DIAGNOSTICS_INVALID'
export const CLIENT_DIAGNOSTICS_INVALID_MESSAGE = 'Invalid client diagnostics'

export const MAX_DIAGNOSTIC_EVENTS_PER_REQUEST = 20
export const MAX_DIAGNOSTIC_DURATION_MS = 600_000
export const MAX_DIAGNOSTIC_ATTEMPT = 10_000
export const MAX_DIAGNOSTIC_PHOTO_BYTES = 50 * 1024 * 1024
export const MAX_DIAGNOSTIC_KEY_LENGTH = 128
export const MAX_DIAGNOSTIC_DEVICE_MEMORY_GB = 1_024
export const MAX_DIAGNOSTIC_HARDWARE_CONCURRENCY = 1_024
export const MIN_DIAGNOSTIC_HTTP_STATUS = 100
export const MAX_DIAGNOSTIC_HTTP_STATUS = 599
export const MAX_DIAGNOSTIC_APP_VERSION_LENGTH = 64

export const DIAGNOSTIC_EVENT_KINDS = ['send_failed', 'step_timing'] as const
export const DIAGNOSTIC_STEPS = [
  'trip_open',
  'photo_reduce',
  'upload_slot',
  'upload_put',
  'upload_confirm',
  'report_send',
  'baixa_total',
] as const
export const DIAGNOSTIC_FAILURE_KINDS = ['network', 'timeout', 'http_status', 'identity'] as const
export const DIAGNOSTIC_EFFECTIVE_TYPES = ['slow-2g', '2g', '3g', '4g'] as const

/** Identificador técnico do tipo de relatório (`occurrence`, `documentOccurrence`…): nunca texto livre. */
export const DIAGNOSTIC_REPORT_KIND_PATTERN = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u
/** Chave opaca (UUID, chave de anexo): sem espaço, barra nem `:`, então URL assinada não passa. */
export const DIAGNOSTIC_OPAQUE_KEY_PATTERN = /^[A-Za-z0-9_-]+$/u
export const DIAGNOSTIC_APP_VERSION_PATTERN = /^[A-Za-z0-9._+-]+$/u

export type DiagnosticEventKind = (typeof DIAGNOSTIC_EVENT_KINDS)[number]
export type DiagnosticStep = (typeof DIAGNOSTIC_STEPS)[number]
export type DiagnosticFailureKind = (typeof DIAGNOSTIC_FAILURE_KINDS)[number]
export type DiagnosticEffectiveType = (typeof DIAGNOSTIC_EFFECTIVE_TYPES)[number]
