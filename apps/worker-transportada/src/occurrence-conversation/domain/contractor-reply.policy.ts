/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF4 and RF5: the pure decisions of the contractor reply. `decideContractorReply` says what an
 * inbound message does to an open reply; `decideAlert` says whether the overdue alarm fires now.
 *
 * - The accepted attachment is the one whose `contentType` was confirmed by the bytes at upload (the
 *   conversation attachment policy); the file name and the declared type never enter the decision.
 * - Only the copied configuration of the reply (`reply.config`) counts: a type reconfigured later changes
 *   the next replies, never this one.
 *
 * ⚠️ Value copy in the API and in the worker (no app imports another), held together by the parity
 * contract in the worker (`test/occurrence-conversation/contractor-reply-parity.contract.ts`).
 */
import type {
  ContractorReplyAlertMode,
  ContractorReplyAttachmentKind,
  ContractorReplyMode,
  ContractorReplyReason,
  ContractorReplyStatus,
} from '../../shared/occurrence-contractor-reply.constant.js'

const MILLISECONDS_PER_MINUTE = 60_000

export const CONTRACTOR_REPLY_ACCEPTED_CONTENT_TYPES: Readonly<
  Record<ContractorReplyAttachmentKind, readonly string[]>
> = {
  pdf: ['application/pdf'],
  pdf_or_image: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
  boleto_pdf: ['application/pdf'],
}

/** Spec 276 T2: the kinds whose accepted attachment is only taken after its content is checked. */
export function requiresContractorReplyDocumentCheck(kind: ContractorReplyAttachmentKind): boolean {
  return kind === 'boleto_pdf'
}

export type ContractorReplyAttachmentInput = {
  /** Confirmed by the bytes when the attachment was stored. */
  readonly contentType: string
  readonly id: string
}

export type ContractorReplyDecisionInput = {
  readonly attachments: readonly ContractorReplyAttachmentInput[]
  /**
   * Spec 276 T2: whether the content of the single accepted attachment was confirmed (the boleto check).
   * Read only for a kind that requires the check; absent there means not confirmed.
   */
  readonly documentConfirmed?: boolean
  readonly reply: {
    readonly config: {
      readonly attachmentKind: ContractorReplyAttachmentKind
      readonly mode: ContractorReplyMode
    }
    readonly status: ContractorReplyStatus
  }
}

export type ContractorReplyIgnoreReason =
  | 'already_answered'
  | 'awaiting_attachment'
  | 'already_delivered'
  | 'cancelled'
  | 'handled'
  | 'mode_off'

export type ContractorReplyDecision =
  | {
      readonly kind: 'accept'
      readonly attachmentId: string
      readonly nextStep: 'await_operator' | 'deliver'
    }
  | { readonly kind: 'ignore'; readonly reason: ContractorReplyIgnoreReason }
  | { readonly kind: 'needs_operator'; readonly reason: ContractorReplyReason }

/** Statuses where an inbound message is left in the conversation and changes nothing (RF4, RF9). */
const IGNORED_STATUS_REASONS: Readonly<
  Partial<Record<ContractorReplyStatus, ContractorReplyIgnoreReason>>
> = {
  awaiting_operator: 'already_answered',
  cancelled: 'cancelled',
  delivered: 'already_delivered',
  handled: 'handled',
  needs_operator: 'already_answered',
  reply_received: 'already_answered',
}

export function decideContractorReply(
  input: ContractorReplyDecisionInput,
): ContractorReplyDecision {
  const { attachments, reply } = input
  const ignoredReason = IGNORED_STATUS_REASONS[reply.status]
  if (ignoredReason !== undefined) return { kind: 'ignore', reason: ignoredReason }
  if (reply.config.mode === 'off') return { kind: 'ignore', reason: 'mode_off' }

  const acceptedContentTypes = CONTRACTOR_REPLY_ACCEPTED_CONTENT_TYPES[reply.config.attachmentKind]
  const accepted = attachments.filter((attachment) =>
    acceptedContentTypes.includes(attachment.contentType),
  )
  const [onlyAccepted] = accepted
  /**
   * A reply with no attachment at all ("Solicitado") only confirms the request: the reply keeps
   * waiting for the document, with its deadline and alarm, and the message stays in the conversation.
   */
  if (attachments.length === 0) return { kind: 'ignore', reason: 'awaiting_attachment' }
  if (onlyAccepted === undefined)
    return { kind: 'needs_operator', reason: 'no_accepted_attachment' }
  if (accepted.length > 1) return { kind: 'needs_operator', reason: 'multiple_attachments' }
  /** A PDF that is not the boleto (the note, a receipt, a scan without text) never goes on by itself. */
  if (
    requiresContractorReplyDocumentCheck(reply.config.attachmentKind) &&
    input.documentConfirmed !== true
  ) {
    return { kind: 'needs_operator', reason: 'document_not_confirmed' }
  }

  return {
    attachmentId: onlyAccepted.id,
    kind: 'accept',
    nextStep: reply.config.mode === 'forward_automatic' ? 'deliver' : 'await_operator',
  }
}

export type ContractorReplyAlertInput = {
  readonly now: Date
  /** Set while a delivery waits for the driver to open the WhatsApp window (RF7). */
  readonly pendingWindowSince: Date | null
  readonly reply: {
    readonly alertCount: number
    readonly config: {
      readonly alertIntervalMinutes: number
      readonly alertMaxCount: number
      readonly alertMode: ContractorReplyAlertMode
    }
    readonly deadlineAt: Date | null
    readonly lastAlertAt: Date | null
    readonly status: ContractorReplyStatus
  }
}

export type ContractorReplyAlertStopReason =
  | 'alert_mode_off'
  | 'cancelled'
  | 'handled'
  | 'max_count_reached'
  | 'no_deadline'
  | 'not_due'
  | 'interval_not_elapsed'
  | 'reply_arrived'

export type ContractorReplyAlertDecision =
  | {
      readonly alertNumber: number
      readonly becomesOverdue: boolean
      readonly kind: 'alert'
    }
  | { readonly kind: 'none'; readonly reason: ContractorReplyAlertStopReason }

const ALERT_STOP_REASON_BY_STATUS: Readonly<
  Partial<Record<ContractorReplyStatus, ContractorReplyAlertStopReason>>
> = {
  awaiting_operator: 'reply_arrived',
  cancelled: 'cancelled',
  delivered: 'reply_arrived',
  handled: 'handled',
  needs_operator: 'reply_arrived',
}

export function decideAlert(input: ContractorReplyAlertInput): ContractorReplyAlertDecision {
  const { now, pendingWindowSince, reply } = input
  const isWaitingForContractor =
    reply.status === 'awaiting_contractor' || reply.status === 'overdue'
  const isWaitingForDriverWindow = reply.status === 'reply_received' && pendingWindowSince !== null
  if (!isWaitingForContractor && !isWaitingForDriverWindow) {
    return { kind: 'none', reason: ALERT_STOP_REASON_BY_STATUS[reply.status] ?? 'reply_arrived' }
  }
  if (reply.config.alertMode === 'off') return { kind: 'none', reason: 'alert_mode_off' }
  if (reply.alertCount >= reply.config.alertMaxCount) {
    return { kind: 'none', reason: 'max_count_reached' }
  }

  const startsAt = isWaitingForContractor ? reply.deadlineAt : pendingWindowSince
  if (startsAt === null) return { kind: 'none', reason: 'no_deadline' }
  if (now.getTime() < startsAt.getTime()) return { kind: 'none', reason: 'not_due' }

  if (reply.alertCount > 0) {
    const previousAlertAt = reply.lastAlertAt ?? startsAt
    const elapsedMilliseconds = now.getTime() - previousAlertAt.getTime()
    if (elapsedMilliseconds < reply.config.alertIntervalMinutes * MILLISECONDS_PER_MINUTE) {
      return { kind: 'none', reason: 'interval_not_elapsed' }
    }
  }

  return {
    alertNumber: reply.alertCount + 1,
    becomesOverdue: reply.status === 'awaiting_contractor',
    kind: 'alert',
  }
}
