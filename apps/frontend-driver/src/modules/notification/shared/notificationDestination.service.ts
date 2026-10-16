/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  DRIVER_OCCURRENCE_KINDS,
  type DriverConversationSubject,
  type DriverOccurrenceRoute,
} from '@/modules/shared/driverRoute.service'

import {
  LEGACY_CONVERSATION_MESSAGE_TEMPLATE_KEY,
  OCCURRENCE_RESOLVED_TEMPLATE_KEY,
  SUBJECT_CONVERSATION_MESSAGE_TEMPLATE_KEY,
  SUBJECT_ID_MAX_LENGTH,
  SUBJECT_TYPE_PATTERN,
} from './notificationTemplate.constant'

export type NotificationDestination =
  | Readonly<{ kind: 'conversation'; subject: DriverConversationSubject }>
  | Readonly<{ kind: 'conversations' }>
  | Readonly<{
      kind: 'occurrence'
      occurrenceId: string
      occurrenceKind: DriverOccurrenceRoute['kind']
    }>
  | Readonly<{ kind: 'stay' }>

type NotificationDestinationInput = Readonly<{
  payload: Readonly<Record<string, unknown>>
  templateKey: string
}>

function isValidSubjectType(value: unknown): value is string {
  return typeof value === 'string' && SUBJECT_TYPE_PATTERN.test(value)
}

function isValidSubjectId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= SUBJECT_ID_MAX_LENGTH
}

function resolveOccurrenceDestination(
  payload: NotificationDestinationInput['payload'],
): NotificationDestination {
  const { occurrenceKind, subjectId, subjectType } = payload
  const knownKind = DRIVER_OCCURRENCE_KINDS.find((candidate) => candidate === occurrenceKind)
  if (subjectType !== 'occurrence' || knownKind === undefined || !isValidSubjectId(subjectId)) {
    return { kind: 'stay' }
  }
  return { kind: 'occurrence', occurrenceId: subjectId, occurrenceKind: knownKind }
}

/** O sino só navega: o aviso de conversa abre o assunto quando o payload o traz, senão a lista. */
export function resolveNotificationDestination(
  input: NotificationDestinationInput,
): NotificationDestination {
  if (input.templateKey === OCCURRENCE_RESOLVED_TEMPLATE_KEY) {
    return resolveOccurrenceDestination(input.payload)
  }
  const isConversationKey =
    input.templateKey === LEGACY_CONVERSATION_MESSAGE_TEMPLATE_KEY ||
    input.templateKey === SUBJECT_CONVERSATION_MESSAGE_TEMPLATE_KEY
  if (!isConversationKey) return { kind: 'stay' }
  const { subjectId, subjectType } = input.payload
  if (isValidSubjectType(subjectType) && isValidSubjectId(subjectId)) {
    return { kind: 'conversation', subject: { subjectId, subjectType } }
  }
  return { kind: 'conversations' }
}
