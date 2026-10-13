/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 248 RF13/RF6 (T5.3): o cliente do retorno da contratante. A leitura é tolerante por item (evento ou
 * entrega que o guard não reconhece sai da lista; o painel continua), mas o retorno em si é estrito: sem
 * estado conhecido é resposta inválida. `data: null` é "esta ocorrência não tem retorno".
 */
import {
  OCCURRENCE_CONVERSATION_ERROR,
  OccurrenceConversationRequestError,
  requestJson,
  type ClientDependencies,
} from './occurrenceConversationClient.service'
import { isRecord, isString } from './occurrenceConversationGuards.validation'
import {
  CONTRACTOR_REPLY_ACTOR_KINDS,
  CONTRACTOR_REPLY_DELIVERY_STATUSES,
  CONTRACTOR_REPLY_DELIVERY_TARGETS,
  CONTRACTOR_REPLY_REASONS,
  CONTRACTOR_REPLY_STATUSES,
  type ContractorReplyDelivery,
  type ContractorReplyEvent,
  type ContractorReplyView,
  type MarkHandledOutcome,
} from './contractorReply.types'

export type ContractorReplyClient = Readonly<{
  markHandled: (input: { note: string; occurrenceId: string }) => Promise<MarkHandledOutcome>
  readReply: (input: { occurrenceId: string }) => Promise<ContractorReplyView | null>
}>

function oneOf<TValue extends string>(list: readonly TValue[], value: unknown): TValue | undefined {
  return list.find((candidate) => candidate === value)
}

function isNullableString(value: unknown): value is null | string {
  return value === null || isString(value)
}

function toEvent(value: unknown): ContractorReplyEvent | null {
  if (!isRecord(value)) return null
  const actorKind = oneOf(CONTRACTOR_REPLY_ACTOR_KINDS, value.actorKind)
  const toStatus = oneOf(CONTRACTOR_REPLY_STATUSES, value.toStatus)
  const fromStatus =
    value.fromStatus === null ? null : oneOf(CONTRACTOR_REPLY_STATUSES, value.fromStatus)
  if (
    actorKind === undefined ||
    toStatus === undefined ||
    fromStatus === undefined ||
    !isString(value.createdAt) ||
    !isString(value.id) ||
    !isNullableString(value.reason)
  ) {
    return null
  }
  return {
    actorKind,
    createdAt: value.createdAt,
    fromStatus,
    id: value.id,
    reason: value.reason,
    toStatus,
  }
}

function toDelivery(value: unknown): ContractorReplyDelivery | null {
  if (!isRecord(value)) return null
  const status = oneOf(CONTRACTOR_REPLY_DELIVERY_STATUSES, value.status)
  const target = oneOf(CONTRACTOR_REPLY_DELIVERY_TARGETS, value.target)
  if (
    status === undefined ||
    target === undefined ||
    !isString(value.id) ||
    !isNullableString(value.reason) ||
    !isNullableString(value.sentAt)
  ) {
    return null
  }
  return { id: value.id, reason: value.reason, sentAt: value.sentAt, status, target }
}

export function toContractorReplyView(value: unknown): ContractorReplyView {
  const status = isRecord(value) ? oneOf(CONTRACTOR_REPLY_STATUSES, value.status) : undefined
  if (
    !isRecord(value) ||
    status === undefined ||
    typeof value.alertCount !== 'number' ||
    typeof value.alertMaxCount !== 'number' ||
    !isNullableString(value.deadlineAt) ||
    !isNullableString(value.handledNote) ||
    !isNullableString(value.replyAttachmentId) ||
    !Array.isArray(value.events) ||
    !Array.isArray(value.deliveries)
  ) {
    throw new OccurrenceConversationRequestError(OCCURRENCE_CONVERSATION_ERROR.RESPONSE_INVALID)
  }
  return {
    alertCount: value.alertCount,
    alertMaxCount: value.alertMaxCount,
    deadlineAt: value.deadlineAt,
    deliveries: value.deliveries.flatMap((delivery) => toDelivery(delivery) ?? []),
    events: value.events.flatMap((event) => toEvent(event) ?? []),
    handledNote: value.handledNote,
    reason: oneOf(CONTRACTOR_REPLY_REASONS, value.reason) ?? null,
    replyAttachmentId: value.replyAttachmentId,
    status,
  }
}

function readOutcomeKind<TKind extends string>(payload: unknown, kinds: readonly TKind[]): TKind {
  const data = isRecord(payload) ? payload.data : undefined
  const kind = isRecord(data) ? oneOf(kinds, data.kind) : undefined
  if (kind === undefined) {
    throw new OccurrenceConversationRequestError(OCCURRENCE_CONVERSATION_ERROR.RESPONSE_INVALID)
  }
  return kind
}

const replyPath = (occurrenceId: string): string =>
  `/trip-occurrences/${encodeURIComponent(occurrenceId)}/contractor-reply`

export function createContractorReplyClient(
  dependencies: ClientDependencies,
): ContractorReplyClient {
  return {
    async markHandled({ note, occurrenceId }) {
      const payload = await requestJson(dependencies, `${replyPath(occurrenceId)}/handled`, {
        body: { note },
        method: 'POST',
      })
      return {
        kind: readOutcomeKind(payload, ['already_handled', 'handled'] as const),
      }
    },
    async readReply({ occurrenceId }) {
      const payload = await requestJson(dependencies, replyPath(occurrenceId))
      const data = isRecord(payload) ? payload.data : undefined
      if (data === null) return null
      return toContractorReplyView(data)
    },
  }
}
