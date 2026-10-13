/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  participantConversationSummarySchema,
  type ParticipantConversationSummary,
  type ParticipantSubjectRef,
} from '@adatechnology/conversation-contracts'

import {
  CONVERSATIONS_OPEN_PATH,
  DRIVER_CONVERSATION_ERROR,
  OPENABLE_SUBJECT_TYPES,
} from './driverConversation.constant'
import { isRouteMissing } from './driverConversationRoutes.service'
import {
  DriverConversationRequestError,
  type DriverConversationHttp,
} from './driverConversationsHttp.service'
import { toConversationSummaryCandidate } from './driverConversationsMapper.service'

/** Se a API desta instalação já tem a rota de abrir; quem desenha o botão assina e some quando não tem. */
export type DriverConversationOpenAvailability = Readonly<{
  isUnavailable: () => boolean
  markUnavailable: () => void
  subscribe: (listener: () => void) => () => void
}>

export function createDriverConversationOpenAvailability(): DriverConversationOpenAvailability {
  let isUnavailable = false
  const listeners = new Set<() => void>()
  return {
    isUnavailable: () => isUnavailable,
    markUnavailable() {
      if (isUnavailable) return
      isUnavailable = true
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export type DriverConversationOpenDependencies = Readonly<{
  availability: DriverConversationOpenAvailability
  fallbackSubjectLabel: () => string
  http: DriverConversationHttp
}>

function isOpenableSubjectType(subjectType: string): boolean {
  return OPENABLE_SUBJECT_TYPES.some((openable) => openable === subjectType)
}

function readData(payload: unknown): unknown {
  return typeof payload === 'object' && payload !== null && 'data' in payload
    ? payload.data
    : undefined
}

function parseSummary(
  dependencies: DriverConversationOpenDependencies,
  payload: unknown,
): ParticipantConversationSummary {
  const candidate = toConversationSummaryCandidate({
    fallbackSubjectLabel: dependencies.fallbackSubjectLabel(),
    raw: readData(payload),
  })
  const parsed = participantConversationSummarySchema.safeParse(candidate)
  if (!parsed.success) {
    throw new DriverConversationRequestError(DRIVER_CONVERSATION_ERROR.RESPONSE_INVALID)
  }
  return parsed.data
}

/**
 * `POST .../conversations/open` — idempotente por natureza (201 ao criar, 200 se já existia). Sem queda
 * para a rota antiga: ela só conhece ocorrência. API sem a rota vira `CONVERSATIONS_UNAVAILABLE` e a
 * disponibilidade fica marcada até recarregar.
 */
export function createDriverConversationOpener(
  dependencies: DriverConversationOpenDependencies,
): (subject: ParticipantSubjectRef) => Promise<ParticipantConversationSummary> {
  const { availability, http } = dependencies
  const unavailable = () =>
    new DriverConversationRequestError(DRIVER_CONVERSATION_ERROR.CONVERSATIONS_UNAVAILABLE)

  return async function openConversation(subject) {
    if (!isOpenableSubjectType(subject.subjectType)) {
      throw new DriverConversationRequestError(DRIVER_CONVERSATION_ERROR.SUBJECT_UNSUPPORTED)
    }
    if (availability.isUnavailable()) throw unavailable()
    let payload: unknown
    try {
      payload = await http.postJson(CONVERSATIONS_OPEN_PATH, {
        body: { subjectId: subject.subjectId, subjectType: subject.subjectType },
      })
    } catch (error) {
      if (!isRouteMissing(error)) throw error
      availability.markUnavailable()
      throw unavailable()
    }
    return parseSummary(dependencies, payload)
  }
}
