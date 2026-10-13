/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 248 RF13 (T5.3): o retorno da contratante como o painel lê. Cópia por valor do vocabulário da API
 * (`occurrence-contractor-reply.constant.ts`); o evento carrega só o tipo de ator, nunca o usuário.
 */
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

export const CONTRACTOR_REPLY_REASONS = ['no_accepted_attachment', 'multiple_attachments'] as const
export type ContractorReplyReason = (typeof CONTRACTOR_REPLY_REASONS)[number]

export const CONTRACTOR_REPLY_ACTOR_KINDS = ['system', 'user'] as const
export type ContractorReplyActorKind = (typeof CONTRACTOR_REPLY_ACTOR_KINDS)[number]

export const CONTRACTOR_REPLY_DELIVERY_TARGETS = [
  'driver_app_chat',
  'driver_whatsapp',
  'note_recipient_email',
  'informed_email',
] as const
export type ContractorReplyDeliveryTarget = (typeof CONTRACTOR_REPLY_DELIVERY_TARGETS)[number]

export const CONTRACTOR_REPLY_DELIVERY_STATUSES = [
  'queued',
  'sent',
  'pending_window',
  'skipped',
  'failed',
] as const
export type ContractorReplyDeliveryStatus = (typeof CONTRACTOR_REPLY_DELIVERY_STATUSES)[number]

export const CONTRACTOR_REPLY_HANDLED_NOTE_MAX_LENGTH = 500

export type ContractorReplyEvent = Readonly<{
  actorKind: ContractorReplyActorKind
  createdAt: string
  fromStatus: ContractorReplyStatus | null
  id: string
  reason: null | string
  toStatus: ContractorReplyStatus
}>

export type ContractorReplyDelivery = Readonly<{
  id: string
  reason: null | string
  sentAt: null | string
  status: ContractorReplyDeliveryStatus
  target: ContractorReplyDeliveryTarget
}>

export type ContractorReplyView = Readonly<{
  alertCount: number
  alertMaxCount: number
  deadlineAt: null | string
  deliveries: readonly ContractorReplyDelivery[]
  events: readonly ContractorReplyEvent[]
  handledNote: null | string
  reason: ContractorReplyReason | null
  replyAttachmentId: null | string
  status: ContractorReplyStatus
}>

/** O que a listagem de ocorrências carrega do retorno: só o estado e a contagem de alertas. */
export type ContractorReplySummary = Readonly<{
  alertCount: number
  status: ContractorReplyStatus
}>

export type MarkHandledOutcome = Readonly<{ kind: 'already_handled' | 'handled' }>
export type DeliverToDriverOutcome = Readonly<{
  kind: 'already_delivered' | 'delivered' | 'skipped'
}>
