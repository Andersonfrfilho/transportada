/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantSubjectRef } from '@adatechnology/conversation-contracts'

import {
  CURRENT_TRIP_PATH,
  DRIVER_CONVERSATION_ERROR,
  DRIVER_CONVERSATION_SUBJECT_TYPE,
} from './driverConversation.constant'
import { DriverConversationRequestError } from './driverConversationsHttp.service'

export function occurrenceIdOf(subject: ParticipantSubjectRef): string {
  if (subject.subjectType !== DRIVER_CONVERSATION_SUBJECT_TYPE) {
    throw new DriverConversationRequestError(DRIVER_CONVERSATION_ERROR.SUBJECT_UNSUPPORTED)
  }
  return subject.subjectId
}

export const messagesPath = (subject: ParticipantSubjectRef): string =>
  `${CURRENT_TRIP_PATH}/occurrences/${encodeURIComponent(occurrenceIdOf(subject))}/messages`
