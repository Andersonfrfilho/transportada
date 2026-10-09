/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 (ADR-0101 §4): a conversa de nota ou de viagem está encerrada se o escritório a encerrou, se
 * a nota saiu da viagem (liberada) ou se a viagem acabou. Derivado na leitura, sem gancho nos fluxos de
 * nota e de viagem. A conversa de ocorrência não encerra, como sempre.
 */
import { TRIP_TERMINAL_STATUSES, type TripStatus } from '../../database/trip.schema.js'
import {
  OCCURRENCE_CONVERSATION_SUBJECT,
  type OccurrenceConversationSubjectType,
} from '../../shared/occurrence-conversation-subject.constant.js'

export type EffectiveConversationStatus = 'closed' | 'open'

export function resolveEffectiveConversationStatus(input: {
  readonly documentReleasedAt: Date | null
  readonly storedStatus: EffectiveConversationStatus
  readonly subjectType: OccurrenceConversationSubjectType
  readonly tripStatus: TripStatus | null
}): EffectiveConversationStatus {
  if (input.subjectType === OCCURRENCE_CONVERSATION_SUBJECT.OCCURRENCE) return 'open'
  if (input.storedStatus === 'closed') return 'closed'
  if (
    input.subjectType === OCCURRENCE_CONVERSATION_SUBJECT.DOCUMENT &&
    input.documentReleasedAt !== null
  ) {
    return 'closed'
  }
  return input.tripStatus !== null && TRIP_TERMINAL_STATUSES.includes(input.tripStatus)
    ? 'closed'
    : 'open'
}
