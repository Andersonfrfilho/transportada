/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF13: what the panel reads about the contractor reply of one occurrence. No personal data:
 * events carry the kind of actor, never the user; deliveries carry no address.
 */
import type {
  ContractorReplyActorKind,
  ContractorReplyDeliveryReason,
  ContractorReplyDeliveryStatus,
  ContractorReplyDeliveryTarget,
  ContractorReplyStatus,
} from '../../shared/occurrence-contractor-reply.constant.js'

export type ContractorReplyViewEvent = {
  readonly actorKind: ContractorReplyActorKind
  readonly createdAt: Date
  readonly fromStatus: ContractorReplyStatus | null
  readonly id: string
  readonly reason: null | string
  readonly toStatus: ContractorReplyStatus
}

export type ContractorReplyViewDelivery = {
  readonly id: string
  readonly reason: ContractorReplyDeliveryReason | null
  readonly sentAt: Date | null
  readonly status: ContractorReplyDeliveryStatus
  readonly target: ContractorReplyDeliveryTarget
}

/**
 * RF6: whether "Reenviar o pedido" may be used now. `reason` is `not_waiting` (the reply no longer waits
 * for the contractor) or `too_soon` (`availableAt` says when); both are `null` when `canResend`.
 */
export type ContractorReplyResendView = {
  readonly availableAt: Date | null
  readonly canResend: boolean
  readonly reason: 'not_waiting' | 'too_soon' | null
}

export type ContractorReplyView = {
  readonly alertCount: number
  readonly alertMaxCount: number
  readonly deadlineAt: Date | null
  readonly deliveries: readonly ContractorReplyViewDelivery[]
  readonly events: readonly ContractorReplyViewEvent[]
  readonly handledNote: null | string
  readonly reason: null | string
  readonly replyAttachmentId: null | string
  readonly resend: ContractorReplyResendView
  readonly status: ContractorReplyStatus
}

/** `undefined`: the occurrence is not in the company. `null`: the occurrence exists without a reply. */
export type ContractorReplyReaderPort = {
  findByOccurrence(input: {
    readonly companyId: string
    readonly occurrenceId: string
  }): Promise<ContractorReplyView | null | undefined>
}

export type MarkContractorReplyHandledOutcome = 'already_handled' | 'handled' | 'not_applicable'

export type ContractorReplyHandledPort = {
  /** `undefined`: no reply for the occurrence in the company. Conditional and idempotent. */
  markHandled(input: {
    readonly actorUserId: string
    readonly companyId: string
    readonly note: string
    readonly now: Date
    readonly occurrenceId: string
  }): Promise<MarkContractorReplyHandledOutcome | undefined>
}
