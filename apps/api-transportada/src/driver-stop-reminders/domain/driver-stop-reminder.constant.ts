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
import type { StopReminderSettings } from './driver-stop-reminder.types.js'

export const DRIVER_STOP_REMINDER_DEFAULT_SETTINGS: StopReminderSettings = {
  maxAttempts: DRIVER_REMINDER_DEFAULT_MAX_ATTEMPTS,
  intervalMinutes: DRIVER_REMINDER_DEFAULT_INTERVAL_MINUTES,
  graceMinMinutes: DRIVER_REMINDER_DEFAULT_GRACE_MIN_MINUTES,
  gracePercent: DRIVER_REMINDER_DEFAULT_GRACE_PERCENT,
  dwellMinutes: DRIVER_REMINDER_DEFAULT_DWELL_MINUTES,
}

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

export const DRIVER_STOP_REMINDER_STAGE = { ARRIVAL: 'arrival', SETTLEMENT: 'settlement' } as const

export const MILLISECONDS_PER_MINUTE = 60_000
export const MILLISECONDS_PER_SECOND = 1000
export const MINUTES_PER_DAY = 1440

export const DRIVER_STOP_REMINDER_SEND_FAILURE_RETRY_MINUTES = 5
export const DRIVER_STOP_REMINDER_DISPATCH_RESERVATION_MINUTES = 2

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
  SEND_FAILED: 'driver_stop_reminder_send_failed',
  DELIVERED: 'driver_stop_reminder_delivery',
} as const
