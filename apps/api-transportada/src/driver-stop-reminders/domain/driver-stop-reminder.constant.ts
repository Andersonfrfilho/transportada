/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import {
  DRIVER_REMINDER_DEFAULT_DWELL_MINUTES,
  DRIVER_REMINDER_DEFAULT_GRACE_MIN_MINUTES,
  DRIVER_REMINDER_DEFAULT_GRACE_PERCENT,
  DRIVER_REMINDER_DEFAULT_INTERVAL_MINUTES,
  DRIVER_REMINDER_DEFAULT_MAX_ATTEMPTS,
} from '../../shared/driver-stop-reminder.constant.js'
import type {
  StopReminderCompanySettings,
  StopReminderSettings,
} from './driver-stop-reminder.types.js'

export const DRIVER_STOP_REMINDER_DEFAULT_SETTINGS: StopReminderSettings = {
  maxAttempts: DRIVER_REMINDER_DEFAULT_MAX_ATTEMPTS,
  intervalMinutes: DRIVER_REMINDER_DEFAULT_INTERVAL_MINUTES,
  graceMinMinutes: DRIVER_REMINDER_DEFAULT_GRACE_MIN_MINUTES,
  gracePercent: DRIVER_REMINDER_DEFAULT_GRACE_PERCENT,
  dwellMinutes: DRIVER_REMINDER_DEFAULT_DWELL_MINUTES,
}

/** Sem linha da empresa: desligada, com os padrões e sempre aberta. A entrega e a tela leem esta mesma constante. */
export const DRIVER_STOP_REMINDER_DEFAULT_COMPANY_SETTINGS: StopReminderCompanySettings = {
  ...DRIVER_STOP_REMINDER_DEFAULT_SETTINGS,
  enabled: false,
  operatingHours: [],
}

/** Faixas aceitas na configuração (RF19); o piso e o teto de cada número são os da CHECK da tabela ou mais estritos. */
export const DRIVER_STOP_REMINDER_SETTINGS_RANGE = {
  DWELL_MINUTES: { max: 240, min: 5 },
  GRACE_MIN_MINUTES: { max: 240, min: 5 },
  GRACE_PERCENT: { max: 100, min: 0 },
  INTERVAL_MINUTES: { max: 120, min: 10 },
  MAX_ATTEMPTS: { max: 5, min: 1 },
  MAX_OPERATING_RANGES_PER_WEEKDAY: 3,
  WEEKDAY: { max: 6, min: 0 },
} as const

export const DRIVER_STOP_REMINDER_SETTINGS_AUDIT = {
  ACTION: 'driver-stop-reminder-settings.saved',
  PERMISSION: 'settings.manage',
  TARGET: 'company_driver_reminder_settings',
} as const

export const DRIVER_STOP_REMINDER_SETTINGS_ORIGIN = {
  COMPANY: 'company',
  DEFAULT: 'default',
} as const

export const DRIVER_STOP_REMINDER_FALLBACK_TRAVEL_SECONDS = 2700

export const DRIVER_STOP_REMINDER_MAX_POSTPONEMENTS = 3
export const DRIVER_STOP_REMINDER_OPEN_QUESTION_WAIT_MINUTES = 5
export const DRIVER_STOP_REMINDER_MAX_SEND_SLOT_WAIT_SECONDS = 120
export const DRIVER_STOP_REMINDER_OPERATING_HOURS_SEARCH_DAYS = 14

export const DRIVER_STOP_REMINDER_SPEECH_NODE = {
  arrival: 'fala_lembrete_chegada',
  arrivalWithoutEstimate: 'fala_lembrete_chegada_sem_previsao',
  settlement: 'fala_lembrete_entrega',
} as const

export const DRIVER_STOP_REMINDER_CHOICE_ACTION = {
  ARRIVED: 'arrived',
  DELIVERED: 'delivered',
  NOT_DELIVERED: 'not_delivered',
  OCCURRENCE: 'occurrence',
  POSTPONE: 'postpone',
} as const

export const DRIVER_STOP_REMINDER_TRANSITION_TYPE = { OPEN: 'open', CLOSE: 'close' } as const

export const DRIVER_STOP_REMINDER_GATE_DECISION = {
  SEND: 'send',
  CLOSE: 'close',
  DEFER: 'defer',
} as const

export const DRIVER_STOP_REMINDER_DEFER_REASON = {
  OUTSIDE_OPERATING_HOURS: 'outside_operating_hours',
  OPEN_QUESTION: 'open_question',
  NO_SEND_SLOT: 'no_send_slot',
} as const

export const DRIVER_STOP_REMINDER_DUE_ACTION = { SEND: 'send', ESCALATE: 'escalate' } as const

export const DRIVER_STOP_REMINDER_POSTPONEMENT_OUTCOME = {
  POSTPONED: 'postponed',
  NO_ANSWER: 'no_answer',
} as const

/** O que a opção 4 resolve: adiou, esgotou os adiamentos ou o lembrete já não está pendente. */
export const DRIVER_STOP_REMINDER_POSTPONE_OUTCOME = {
  ...DRIVER_STOP_REMINDER_POSTPONEMENT_OUTCOME,
  CLOSED: 'closed',
} as const

export const DRIVER_STOP_REMINDER_STAGE = { ARRIVAL: 'arrival', SETTLEMENT: 'settlement' } as const

export const MILLISECONDS_PER_MINUTE = 60_000
export const MILLISECONDS_PER_SECOND = 1000
export const MINUTES_PER_DAY = 1440

export const DRIVER_STOP_REMINDER_SEND_FAILURE_RETRY_MINUTES = 5
export const DRIVER_STOP_REMINDER_DISPATCH_RESERVATION_MINUTES = 2
export const DRIVER_STOP_REMINDER_RECORD_SENT_MAX_ATTEMPTS = 3
export const DRIVER_STOP_REMINDER_RECORD_SENT_RETRY_DELAY_MS = 200

export const DRIVER_STOP_REMINDER_OUTCOME = {
  SENT: 'sent',
  DEFERRED: 'deferred',
  CLOSED: 'closed',
  ESCALATED: 'escalated',
} as const

export const DRIVER_STOP_REMINDER_STATUS = {
  PENDING: 'pending',
  ESCALATED: 'escalated',
} as const

export const DRIVER_STOP_REMINDER_DELIVERY_LOG = {
  RECORD_FAILED: 'driver_stop_reminder_record_failed',
  SEND_FAILED: 'driver_stop_reminder_send_failed',
  DELIVERED: 'driver_stop_reminder_delivery',
} as const

/** Teto de etapas abertas por ciclo da varredura; o que passar disso espera o próximo ciclo. */
export const DRIVER_STOP_REMINDER_RECONCILIATION_BATCH_LIMIT = 200
