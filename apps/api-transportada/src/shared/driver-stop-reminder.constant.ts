/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 299: vocabulários fechados do lembrete ao motorista — a CHECK de cada coluna sai daqui.
 */
export const DRIVER_STOP_REMINDER_STAGES = ['arrival', 'settlement'] as const
export type DriverStopReminderStage = (typeof DRIVER_STOP_REMINDER_STAGES)[number]

export const DRIVER_STOP_REMINDER_STATUSES = [
  'pending',
  'closed',
  'escalated',
  'cancelled',
] as const
export type DriverStopReminderStatus = (typeof DRIVER_STOP_REMINDER_STATUSES)[number]

export const DRIVER_STOP_REMINDER_ORIGIN_KINDS = [
  'shared_point',
  'previous_stop',
  'company',
  'fallback',
] as const
export type DriverStopReminderOriginKind = (typeof DRIVER_STOP_REMINDER_ORIGIN_KINDS)[number]

export const DRIVER_STOP_REMINDER_CHANNELS = ['group', 'direct_text', 'direct_template'] as const
export type DriverStopReminderChannel = (typeof DRIVER_STOP_REMINDER_CHANNELS)[number]

export const DRIVER_STOP_REMINDER_CLOSED_REASONS = [
  'arrived',
  'stop_closed',
  'occurrence',
  'superseded',
  'departure_cancelled',
  'trip_closed',
  'trip_cancelled',
  'dismissed',
] as const
export type DriverStopReminderClosedReason = (typeof DRIVER_STOP_REMINDER_CLOSED_REASONS)[number]

export const DRIVER_REMINDER_DEFAULT_MAX_ATTEMPTS = 3
export const DRIVER_REMINDER_DEFAULT_INTERVAL_MINUTES = 30
export const DRIVER_REMINDER_DEFAULT_GRACE_MIN_MINUTES = 30
export const DRIVER_REMINDER_DEFAULT_GRACE_PERCENT = 50
export const DRIVER_REMINDER_DEFAULT_DWELL_MINUTES = 30
