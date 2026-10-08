/* Copyright (c) 2026 Ada Technology. MIT License. */

export const CONTRACTOR_REPLY_MODES = [
  'off',
  'forward_after_approval',
  'forward_automatic',
] as const

export const CONTRACTOR_REPLY_ATTACHMENT_KINDS = ['pdf', 'pdf_or_image'] as const

export const DRIVER_REPLY_CHANNELS = ['app_chat', 'whatsapp', 'both'] as const

export const DRIVER_REPLY_WINDOW_CLOSED_ACTIONS = ['fallback_app_chat', 'wait_for_driver'] as const

export const CONTRACTOR_REPLY_ALERT_MODES = ['off', 'alert_operator'] as const

export const NOTE_RECIPIENT_FORWARD_MODES = ['off', 'manual', 'automatic'] as const

export const INFORMED_EMAIL_FORWARD_MODES = ['off', 'manual'] as const

export const CONTRACTOR_REPLY_WAIT_HOURS_RANGE = { min: 1, max: 168 } as const

export const CONTRACTOR_REPLY_ALERT_INTERVAL_MINUTES_RANGE = { min: 15, max: 1440 } as const

export const CONTRACTOR_REPLY_ALERT_MAX_COUNT_RANGE = { min: 1, max: 96 } as const
