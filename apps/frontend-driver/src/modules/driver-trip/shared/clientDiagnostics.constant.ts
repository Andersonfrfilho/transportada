/* Copyright (c) 2026 Ada Technology. MIT License. */

/** Espelha `trip-client-diagnostics.constant.ts` da API: o contrato de paridade prende as duas listas. */
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
export const DIAGNOSTIC_FAILURE_KINDS = [
  'network',
  'timeout',
  'http_status',
  'identity',
  'local',
] as const

export const EVENT_KIND_SEND_FAILED = 'send_failed'
export const EVENT_KIND_STEP_TIMING = 'step_timing'

export const STEP_TRIP_OPEN = 'trip_open'
export const STEP_PHOTO_REDUCE = 'photo_reduce'
export const STEP_UPLOAD_SLOT = 'upload_slot'
export const STEP_UPLOAD_PUT = 'upload_put'
export const STEP_UPLOAD_CONFIRM = 'upload_confirm'
export const STEP_REPORT_SEND = 'report_send'
export const STEP_BAIXA_TOTAL = 'baixa_total'
