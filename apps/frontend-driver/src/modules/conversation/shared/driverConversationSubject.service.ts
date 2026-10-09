/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantSubjectRef } from '@adatechnology/conversation-contracts'

import {
  CONVERSATIONS_PATH,
  CURRENT_TRIP_PATH,
  DRIVER_CONVERSATION_ERROR,
  DRIVER_CONVERSATION_SUBJECT_TYPE,
  DRIVER_CONVERSATION_SUBJECT_TYPES,
} from './driverConversation.constant'
import { DriverConversationRequestError } from './driverConversationsHttp.service'

function isSupportedSubjectType(subjectType: string): boolean {
  return DRIVER_CONVERSATION_SUBJECT_TYPES.some((supported) => supported === subjectType)
}

/** Recusa antes de qualquer rede o assunto que o app não conhece. */
export function assertSupportedSubject(subject: ParticipantSubjectRef): void {
  if (!isSupportedSubjectType(subject.subjectType)) {
    throw new DriverConversationRequestError(DRIVER_CONVERSATION_ERROR.SUBJECT_UNSUPPORTED)
  }
}

/** A rota antiga só conhece ocorrência: nota e viagem não têm como cair nela. */
export function occurrenceIdOf(subject: ParticipantSubjectRef): string {
  if (subject.subjectType !== DRIVER_CONVERSATION_SUBJECT_TYPE) {
    throw new DriverConversationRequestError(DRIVER_CONVERSATION_ERROR.SUBJECT_UNSUPPORTED)
  }
  return subject.subjectId
}

export function subjectPath(subject: ParticipantSubjectRef): string {
  assertSupportedSubject(subject)
  return `${CONVERSATIONS_PATH}/${encodeURIComponent(subject.subjectType)}/${encodeURIComponent(subject.subjectId)}`
}

export function legacySubjectPath(subject: ParticipantSubjectRef): string {
  return `${CURRENT_TRIP_PATH}/occurrences/${encodeURIComponent(occurrenceIdOf(subject))}`
}
