/* Copyright (c) 2026 Ada Technology. MIT License. */

/** ⚠️ Cópia por valor do vocabulário do painel: um app não importa código de outro. */
const CONTRACTOR_REPLY_MODES = ['off', 'forward_after_approval', 'forward_automatic'] as const
const CONTRACTOR_REPLY_ATTACHMENT_KINDS = ['pdf', 'pdf_or_image'] as const
const DRIVER_REPLY_CHANNELS = ['app_chat', 'whatsapp', 'both'] as const
const DRIVER_REPLY_WINDOW_CLOSED_ACTIONS = ['fallback_app_chat', 'wait_for_driver'] as const
const CONTRACTOR_REPLY_ALERT_MODES = ['off', 'alert_operator'] as const
const NOTE_RECIPIENT_FORWARD_MODES = ['off', 'manual', 'automatic'] as const
const INFORMED_EMAIL_FORWARD_MODES = ['off', 'manual'] as const

type FieldCheck = (value: unknown) => boolean

function isOneOfValues(values: readonly unknown[], value: unknown): boolean {
  return values.includes(value)
}

function isIntegerInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
}

const CONTRACTOR_REPLY_FIELD_CHECKS: Readonly<Record<string, FieldCheck>> = {
  contractorReplyAlertIntervalMinutes: (value) => isIntegerInRange(value, 15, 1440),
  contractorReplyAlertMaxCount: (value) => isIntegerInRange(value, 1, 96),
  contractorReplyAlertMode: (value) => isOneOfValues(CONTRACTOR_REPLY_ALERT_MODES, value),
  contractorReplyAttachmentKind: (value) => isOneOfValues(CONTRACTOR_REPLY_ATTACHMENT_KINDS, value),
  contractorReplyMode: (value) => isOneOfValues(CONTRACTOR_REPLY_MODES, value),
  contractorReplyWaitHours: (value) => value === null || isIntegerInRange(value, 1, 168),
  driverReplyChannel: (value) => isOneOfValues(DRIVER_REPLY_CHANNELS, value),
  driverReplyTemplate: (value) => typeof value === 'string',
  driverReplyWindowClosedAction: (value) =>
    isOneOfValues(DRIVER_REPLY_WINDOW_CLOSED_ACTIONS, value),
  forwardEmailBody: (value) => typeof value === 'string',
  forwardEmailSubject: (value) => typeof value === 'string',
  forwardToInformedEmail: (value) => isOneOfValues(INFORMED_EMAIL_FORWARD_MODES, value),
  forwardToNoteRecipient: (value) => isOneOfValues(NOTE_RECIPIENT_FORWARD_MODES, value),
}

/** Ausente é API anterior ao campo; presente, só no vocabulário e na faixa. */
export function hasValidContractorReplyFields(value: Readonly<Record<string, unknown>>): boolean {
  return Object.entries(CONTRACTOR_REPLY_FIELD_CHECKS).every(
    ([key, check]) => value[key] === undefined || check(value[key]),
  )
}
