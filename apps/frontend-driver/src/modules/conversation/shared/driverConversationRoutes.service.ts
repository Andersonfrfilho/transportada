/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantSubjectRef } from '@adatechnology/conversation-contracts'

import {
  CONVERSATIONS_PATH,
  CONVERSATION_NOT_FOUND_CODE,
  LEGACY_OCCURRENCE_CONVERSATIONS_PATH,
  ROUTE_NOT_IMPLEMENTED_STATUS,
} from './driverConversation.constant'
import {
  DriverConversationRequestError,
  type DriverConversationHttp,
  type DriverConversationRequestInit,
} from './driverConversationsHttp.service'
import { legacySubjectPath, subjectPath } from './driverConversationSubject.service'

export type RoutedList = Readonly<{ isLegacy: boolean; payload: unknown }>

export type DriverConversationRoutes = Readonly<{
  list: (cursor?: string) => Promise<RoutedList>
  markRead: (subject: ParticipantSubjectRef) => Promise<void>
  messages: (subject: ParticipantSubjectRef) => Promise<unknown>
  postMessage: (
    subject: ParticipantSubjectRef,
    init: DriverConversationRequestInit,
  ) => Promise<unknown>
  requestUpload: (subject: ParticipantSubjectRef, body: object) => Promise<unknown>
}>

/** 404 com o código de "assunto inexistente" é resposta da rota nova; qualquer outro 404 (ou 501) é rota ainda não implantada. */
export function isRouteMissing(error: unknown): boolean {
  if (!(error instanceof DriverConversationRequestError)) return false
  if (error.status === ROUTE_NOT_IMPLEMENTED_STATUS) return true
  return error.status === 404 && error.code !== CONVERSATION_NOT_FOUND_CODE
}

/**
 * Rotas por assunto (`/conversations/:tipo/:id/**`) com queda para as de ocorrência enquanto a API
 * não estiver implantada (ADR-0081 §9). Uma vez que a rota nova some, o adapter fica nas antigas até
 * recarregar — não repete o 404 a cada ciclo de atualização.
 */
export function createDriverConversationRoutes(
  http: DriverConversationHttp,
): DriverConversationRoutes {
  let isLegacy = false

  async function route<TResult>(
    run: Readonly<{ current: () => Promise<TResult>; legacy: () => Promise<TResult> }>,
  ): Promise<TResult> {
    if (isLegacy) return run.legacy()
    try {
      return await run.current()
    } catch (error) {
      if (!isRouteMissing(error)) throw error
      isLegacy = true
      return run.legacy()
    }
  }

  return {
    async list(cursor) {
      const query = cursor === undefined ? '' : `?cursor=${encodeURIComponent(cursor)}`
      return route<RoutedList>({
        current: async () => ({
          isLegacy: false,
          payload: await http.getJson(`${CONVERSATIONS_PATH}${query}`),
        }),
        legacy: async () => ({
          isLegacy: true,
          payload: await http.getJson(LEGACY_OCCURRENCE_CONVERSATIONS_PATH),
        }),
      })
    },
    async markRead(subject) {
      await route({
        current: () => http.postJson(`${subjectPath(subject)}/messages/read`),
        legacy: () => http.postJson(`${legacySubjectPath(subject)}/messages/read`),
      })
    },
    messages: (subject) =>
      route({
        current: () => http.getJson(`${subjectPath(subject)}/messages`),
        legacy: () => http.getJson(`${legacySubjectPath(subject)}/messages`),
      }),
    postMessage: (subject, init) =>
      route({
        current: () => http.postJson(`${subjectPath(subject)}/messages`, init),
        legacy: () => http.postJson(`${legacySubjectPath(subject)}/messages`, init),
      }),
    requestUpload: (subject, body) =>
      route({
        current: () => http.postJson(`${subjectPath(subject)}/uploads`, { body }),
        legacy: () => http.postJson(`${legacySubjectPath(subject)}/uploads`, { body }),
      }),
  }
}
