/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248: the closed vocabularies and limits of the contractor reply. The schema builds every CHECK
 * from these, so a value written outside them fails in the database and not only in the use case.
 */
export const CONTRACTOR_REPLY_MODES = [
  'off',
  'forward_after_approval',
  'forward_automatic',
] as const
export type ContractorReplyMode = (typeof CONTRACTOR_REPLY_MODES)[number]

/** Spec 276 T2: `boleto_pdf` is a PDF whose content is checked as the boleto of the note. */
export const CONTRACTOR_REPLY_ATTACHMENT_KINDS = ['pdf', 'pdf_or_image', 'boleto_pdf'] as const
export type ContractorReplyAttachmentKind = (typeof CONTRACTOR_REPLY_ATTACHMENT_KINDS)[number]

export const DRIVER_REPLY_CHANNELS = ['app_chat', 'whatsapp', 'both'] as const
export type DriverReplyChannel = (typeof DRIVER_REPLY_CHANNELS)[number]

export const DRIVER_REPLY_WINDOW_CLOSED_ACTIONS = ['fallback_app_chat', 'wait_for_driver'] as const
export type DriverReplyWindowClosedAction = (typeof DRIVER_REPLY_WINDOW_CLOSED_ACTIONS)[number]

export const CONTRACTOR_REPLY_ALERT_MODES = ['off', 'alert_operator'] as const
export type ContractorReplyAlertMode = (typeof CONTRACTOR_REPLY_ALERT_MODES)[number]

export const FORWARD_TO_NOTE_RECIPIENT_MODES = ['off', 'manual', 'automatic'] as const
export type ForwardToNoteRecipientMode = (typeof FORWARD_TO_NOTE_RECIPIENT_MODES)[number]

export const FORWARD_TO_INFORMED_EMAIL_MODES = ['off', 'manual'] as const
export type ForwardToInformedEmailMode = (typeof FORWARD_TO_INFORMED_EMAIL_MODES)[number]

export const CONTRACTOR_REPLY_TYPE_DEFAULTS = {
  alertIntervalMinutes: 60,
  alertMaxCount: 24,
  alertMode: 'off',
  attachmentKind: 'pdf',
  driverReplyChannel: 'app_chat',
  driverReplyWindowClosedAction: 'fallback_app_chat',
  forwardToInformedEmail: 'off',
  forwardToNoteRecipient: 'off',
  mode: 'off',
} as const

export const CONTRACTOR_REPLY_WAIT_HOURS = { max: 168, min: 1 } as const
export const CONTRACTOR_REPLY_ALERT_INTERVAL_MINUTES = { max: 1440, min: 15 } as const
export const CONTRACTOR_REPLY_ALERT_MAX_COUNT = { max: 96, min: 1 } as const

export const DRIVER_REPLY_TEMPLATE_MAX_LENGTH = 1000
export const FORWARD_EMAIL_SUBJECT_MAX_LENGTH = 200
export const FORWARD_EMAIL_BODY_MAX_LENGTH = 4000
export const CONTRACTOR_REPLY_HANDLED_NOTE_MAX_LENGTH = 500
export const CONTRACTOR_REPLY_EMAIL_ADDRESS_MAX_LENGTH = 254
/** Spec 248 T4.7: e-mails a terceiros por ocorrência (os que saíram ou estão na fila). */
export const CONTRACTOR_REPLY_EMAIL_MAX_PER_OCCURRENCE = 5

export const CONTRACTOR_REPLY_STATUSES = [
  'awaiting_contractor',
  'overdue',
  'reply_received',
  'awaiting_operator',
  'needs_operator',
  'delivered',
  'handled',
  'cancelled',
] as const
export type ContractorReplyStatus = (typeof CONTRACTOR_REPLY_STATUSES)[number]

/** The statuses that still wait for the contractor, and so carry a deadline in the partial index. */
export const CONTRACTOR_REPLY_WAITING_STATUSES = ['awaiting_contractor', 'overdue'] as const

export const CONTRACTOR_REPLY_REASONS = [
  'no_accepted_attachment',
  'multiple_attachments',
  'document_not_confirmed',
] as const
export type ContractorReplyReason = (typeof CONTRACTOR_REPLY_REASONS)[number]

export const CONTRACTOR_REPLY_DELIVERY_TARGETS = [
  'driver_app_chat',
  'driver_whatsapp',
  'note_recipient_email',
  'informed_email',
] as const
export type ContractorReplyDeliveryTarget = (typeof CONTRACTOR_REPLY_DELIVERY_TARGETS)[number]

export const CONTRACTOR_REPLY_EMAIL_TARGETS = ['note_recipient_email', 'informed_email'] as const

export const CONTRACTOR_REPLY_DELIVERY_TRIGGERS = ['automatic', 'operator'] as const
export type ContractorReplyDeliveryTrigger = (typeof CONTRACTOR_REPLY_DELIVERY_TRIGGERS)[number]

export const CONTRACTOR_REPLY_DELIVERY_STATUSES = [
  'queued',
  'sent',
  'pending_window',
  'skipped',
  'failed',
] as const
export type ContractorReplyDeliveryStatus = (typeof CONTRACTOR_REPLY_DELIVERY_STATUSES)[number]

export const CONTRACTOR_REPLY_DELIVERY_REASONS = [
  'driver_without_account',
  'driver_unreachable',
  'whatsapp_window_closed',
  'note_without_recipient_email',
  'attachment_too_large_for_email',
  'send_failed',
] as const
export type ContractorReplyDeliveryReason = (typeof CONTRACTOR_REPLY_DELIVERY_REASONS)[number]

export const CONTRACTOR_REPLY_ACTOR_KINDS = ['system', 'user'] as const
export type ContractorReplyActorKind = (typeof CONTRACTOR_REPLY_ACTOR_KINDS)[number]

export const CONTRACTOR_REPLY_IDEMPOTENCY_KEY_MAX_LENGTH = 120
