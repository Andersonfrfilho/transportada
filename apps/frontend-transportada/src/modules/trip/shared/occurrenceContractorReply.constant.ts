/* Copyright (c) 2026 Ada Technology. MIT License. */

export const CONTRACTOR_REPLY_MODES = [
  'off',
  'forward_after_approval',
  'forward_automatic',
] as const

/**
 * Spec 276 T4: a trava de pedido repetido na mesma nota. `while_request_open` bloqueia enquanto o pedido à contratante
 * não foi entregue nem encerrado; `until_resolved` até a ocorrência ser solucionada ou cancelada; `allow` nunca bloqueia.
 */
export const DUPLICATE_REQUEST_POLICIES = ['while_request_open', 'until_resolved', 'allow'] as const
export type DuplicateRequestPolicy = (typeof DUPLICATE_REQUEST_POLICIES)[number]
/** O tipo novo nasce bloqueando; o padrão do banco (`allow`) é só para o tipo antigo que não pede nada. */
export const DUPLICATE_REQUEST_POLICY_FOR_NEW_TYPE: DuplicateRequestPolicy = 'while_request_open'

/**
 * Spec 279 RF9: o que o tipo diz sobre o botão "Enviar ao cliente". `off` (padrão) esconde o botão; os outros são o
 * tipo de e-mail do cliente que ele usa (mesmo vocabulário do cadastro do cliente, D1).
 */
export const CLIENT_EMAIL_TYPES = ['off', 'boleto', 'invoice', 'finance', 'general'] as const
export type ClientEmailType = (typeof CLIENT_EMAIL_TYPES)[number]

/** Spec 276 T2: `boleto_pdf` é o PDF conferido como boleto da nota (linha digitável e número ou valor). */
export const CONTRACTOR_REPLY_ATTACHMENT_KINDS = ['pdf', 'pdf_or_image', 'boleto_pdf'] as const

export const DRIVER_REPLY_CHANNELS = ['app_chat', 'whatsapp', 'both'] as const

export const DRIVER_REPLY_WINDOW_CLOSED_ACTIONS = ['fallback_app_chat', 'wait_for_driver'] as const

export const CONTRACTOR_REPLY_ALERT_MODES = ['off', 'alert_operator'] as const

export const NOTE_RECIPIENT_FORWARD_MODES = ['off', 'manual', 'automatic'] as const

export const INFORMED_EMAIL_FORWARD_MODES = ['off', 'manual'] as const

export const CONTRACTOR_REPLY_WAIT_HOURS_RANGE = { min: 1, max: 168 } as const

export const CONTRACTOR_REPLY_ALERT_INTERVAL_MINUTES_RANGE = { min: 15, max: 1440 } as const

export const CONTRACTOR_REPLY_ALERT_MAX_COUNT_RANGE = { min: 1, max: 96 } as const

export type ContractorReplyMode = (typeof CONTRACTOR_REPLY_MODES)[number]
export type ContractorReplyAttachmentKind = (typeof CONTRACTOR_REPLY_ATTACHMENT_KINDS)[number]
export type ContractorReplyAlertMode = (typeof CONTRACTOR_REPLY_ALERT_MODES)[number]
export type NoteRecipientForwardMode = (typeof NOTE_RECIPIENT_FORWARD_MODES)[number]
export type InformedEmailForwardMode = (typeof INFORMED_EMAIL_FORWARD_MODES)[number]

export const FORWARD_EMAIL_SUBJECT_MAX_LENGTH = 200
export const FORWARD_EMAIL_BODY_MAX_LENGTH = 4000
