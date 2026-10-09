/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4b (api-contract, "Rotas do escritório"): o lado de leitura da conversa de nota e de viagem
 * vista pelo escritório — a lista da viagem, as mensagens do assunto e a marcação de lida. Ler é
 * `fleet.read`, a mesma política (`READ_POLICY`) da conversa de ocorrência do escritório; escrever está em
 * `office-subject-conversation-write.routes.ts`. O assunto é da viagem do caminho: fora dela, 404. As
 * rotas de ocorrência da 183 ficam em `occurrence-conversation.routes.ts`, intactas. Toda resposta é `no-store`.
 */
import { z } from 'zod'

import {
  parseAgainstSchema,
  parseUuidPathIdentifier,
  readListQuery,
} from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { OFFICE_SUBJECT_MESSAGES_MAX_LIMIT } from '../domain/office-subject-conversation.constant.js'
import { OPENABLE_SUBJECT_TYPES } from '../domain/driver-subject-conversation.constant.js'
import type { OpenableSubjectType } from '../domain/driver-subject-conversation.constant.js'
import type { createListOfficeSubjectMessagesUseCase } from '../application/list-office-subject-messages.use-case.js'
import type { createListTripSubjectConversationsUseCase } from '../application/list-trip-subject-conversations.use-case.js'
import type { createMarkOfficeSubjectReadUseCase } from '../application/mark-office-subject-read.use-case.js'

const READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const
export const TRIP_CONVERSATIONS_PATH = '/trips/:tripId/conversations'
export const TRIP_SUBJECT_PATH = `${TRIP_CONVERSATIONS_PATH}/:subjectType/:subjectId`
const MESSAGES_PATH = `${TRIP_SUBJECT_PATH}/messages`
const READ_PATH = `${MESSAGES_PATH}/read`

const subjectTypeSchema = z.enum(OPENABLE_SUBJECT_TYPES)
const messagesLimitSchema = z.coerce.number().int().min(1).max(OFFICE_SUBJECT_MESSAGES_MAX_LIMIT)

export function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
    status,
  })
}

export type OfficeSubjectPath = {
  readonly subjectId: string
  readonly subjectType: OpenableSubjectType
  readonly tripId: string
}

/** A ocorrência não fecha nem se abre pelo escritório por aqui: fora do vocabulário, 400. */
export function parseOfficeSubjectPath(
  pathParameters: Readonly<Record<string, string>>,
): OfficeSubjectPath {
  return {
    subjectId: parseUuidPathIdentifier(pathParameters.subjectId ?? ''),
    subjectType: parseAgainstSchema(subjectTypeSchema, pathParameters.subjectType),
    tripId: parseUuidPathIdentifier(pathParameters.tripId ?? ''),
  }
}

export function createOfficeSubjectConversationRoutes(dependencies: {
  readonly list: Pick<ReturnType<typeof createListTripSubjectConversationsUseCase>, 'list'>
  readonly markRead: Pick<ReturnType<typeof createMarkOfficeSubjectReadUseCase>, 'markRead'>
  readonly messages: Pick<ReturnType<typeof createListOfficeSubjectMessagesUseCase>, 'list'>
}): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly tripId: string }>({
      async handle({ context, input }): Promise<Response> {
        const data = await dependencies.list.list({
          companyId: context.scope.companyId,
          tripId: input.tripId,
          userId: context.scope.userId,
        })
        return jsonResponse({ data })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        tripId: parseUuidPathIdentifier(pathParameters.tripId ?? ''),
      }),
      pathname: TRIP_CONVERSATIONS_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<OfficeSubjectPath & { readonly before?: string; readonly limit?: number }>({
      async handle({ context, input }): Promise<Response> {
        const data = await dependencies.messages.list({
          ...input,
          companyId: context.scope.companyId,
        })
        return jsonResponse({ data })
      },
      method: 'GET',
      parse: ({ pathParameters, request }) => {
        const query = readListQuery(new URL(request.url), new Set(['before', 'limit']))
        const before = query.get('before')
        const limit = query.get('limit')
        return {
          ...parseOfficeSubjectPath(pathParameters),
          ...(before === null ? {} : { before: parseUuidPathIdentifier(before) }),
          ...(limit === null ? {} : { limit: parseAgainstSchema(messagesLimitSchema, limit) }),
        }
      },
      pathParameterFormat: 'raw',
      pathname: MESSAGES_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<OfficeSubjectPath>({
      async handle({ context, input }): Promise<Response> {
        await dependencies.markRead.markRead({
          ...input,
          companyId: context.scope.companyId,
          userId: context.scope.userId,
        })
        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'POST',
      parse: ({ pathParameters }) => parseOfficeSubjectPath(pathParameters),
      pathParameterFormat: 'raw',
      pathname: READ_PATH,
      policy: READ_POLICY,
    }),
  ]
}
