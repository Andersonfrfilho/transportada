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

/**
 * Spec 276 T4: a trava de pedido repetido na mesma nota, por tipo. `while_request_open` bloqueia enquanto o pedido à
 * contratante não foi entregue ao motorista nem encerrado; `until_resolved` até a ocorrência ser solucionada ou
 * cancelada; `allow` nunca bloqueia. O padrão da coluna é `allow` (quem grava sem a chave fica como antes); a migration
 * liga a trava nos tipos que já pediam algo à contratante, e o cadastro de tipo novo sugere bloquear.
 */
export const DUPLICATE_REQUEST_POLICIES = ['while_request_open', 'until_resolved', 'allow'] as const
export type DuplicateRequestPolicy = (typeof DUPLICATE_REQUEST_POLICIES)[number]
export const DUPLICATE_REQUEST_POLICY_DEFAULT: DuplicateRequestPolicy = 'allow'

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

/**
 * Spec 278 D1: reasons only of the history event, never of the reply — the outcome of the boleto check.
 * `document_confirmed` goes on the accepting transition; `document_without_text` on the move to the operator
 * when the PDF gave no text (or there was no reader). The reply itself keeps `document_not_confirmed`.
 */
export const CONTRACTOR_REPLY_EVENT_REASONS = [
  'document_confirmed',
  'document_without_text',
] as const
export type ContractorReplyEventReason = (typeof CONTRACTOR_REPLY_EVENT_REASONS)[number]

export const CONTRACTOR_REPLY_DELIVERY_TARGETS = [
  'driver_app_chat',
  'driver_whatsapp',
  'note_recipient_email',
  'informed_email',
  /** Spec 276 T5: a resposta automática à contratante (uma por conversa). Não leva o documento nem tira o token. */
  'contractor_acknowledgement',
  /** Spec 279 D3: o boleto aos e-mails do cadastro do cliente de entrega (tipo `boleto`), um e-mail por endereço. */
  'client_boleto_emails',
  /** Spec 281 T5 (D5): o boleto por WhatsApp (Evolution) aos números do cliente, um envio por número (E.164). */
  'client_boleto_whatsapp',
] as const
export type ContractorReplyDeliveryTarget = (typeof CONTRACTOR_REPLY_DELIVERY_TARGETS)[number]

/** Spec 281 T5: o envio do boleto por WhatsApp ao cliente; o `address` da entrega é o número em E.164. */
export const CONTRACTOR_REPLY_WHATSAPP_TARGET = 'client_boleto_whatsapp' as const

/** Spec 288: o envio do boleto por e-mail ao cliente; o `address` da entrega é o e-mail. */
export const CONTRACTOR_REPLY_CLIENT_EMAIL_TARGET = 'client_boleto_emails' as const

/** Os encaminhamentos do boleto a um terceiro: sem token de resposta e com o anexo ligado pela entrega. */
export const CONTRACTOR_REPLY_EMAIL_TARGETS = [
  'note_recipient_email',
  'informed_email',
  'client_boleto_emails',
] as const

/** Spec 276 T5: as entregas por e-mail cujo status segue o da mensagem — os encaminhamentos e a resposta automática. */
export const CONTRACTOR_REPLY_MAIL_DELIVERY_TARGETS = [
  ...CONTRACTOR_REPLY_EMAIL_TARGETS,
  'contractor_acknowledgement',
] as const

export const CONTRACTOR_REPLY_DELIVERY_TRIGGERS = ['automatic', 'operator'] as const
export type ContractorReplyDeliveryTrigger = (typeof CONTRACTOR_REPLY_DELIVERY_TRIGGERS)[number]

/** Spec 286 (RF4): o canal cuja falha levou a entrega automática a sair por outro; só a queda do WhatsApp para o e-mail. */
export const CONTRACTOR_REPLY_DELIVERY_FALLBACK_SOURCES = ['whatsapp'] as const
export type ContractorReplyFallbackFrom =
  | (typeof CONTRACTOR_REPLY_DELIVERY_FALLBACK_SOURCES)[number]
  | null

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
  /** Spec 279 RF10: o envio automático ao cliente não achou e-mail do tipo no cadastro dele; nada saiu. */
  'client_without_email',
  /** Spec 281 T5: o Evolution disse que o número não tem WhatsApp; a tela oferece o e-mail. */
  'whatsapp_number_not_found',
  /** Spec 281 T5 (RF5): a instância não estava conectada (ou caiu) na hora do envio; "Tentar de novo" vale. */
  'whatsapp_disconnected',
  /** Spec 281 T5: arquivo acima do teto do WhatsApp; recusado antes de chamar o Evolution. */
  'attachment_too_large_for_whatsapp',
  /** Spec 286 T3 (RF3/RF4): o envio automático por WhatsApp não achou número do cliente no cadastro; cai para o e-mail. */
  'client_without_whatsapp',
  /** Spec 286 T3 (RF2): o canal ligado não tem modelo utilizável no módulo de notificação; aquele canal não sai. */
  'template_missing',
] as const
export type ContractorReplyDeliveryReason = (typeof CONTRACTOR_REPLY_DELIVERY_REASONS)[number]

export const CONTRACTOR_REPLY_ACTOR_KINDS = ['system', 'user'] as const
export type ContractorReplyActorKind = (typeof CONTRACTOR_REPLY_ACTOR_KINDS)[number]

export const CONTRACTOR_REPLY_IDEMPOTENCY_KEY_MAX_LENGTH = 120
