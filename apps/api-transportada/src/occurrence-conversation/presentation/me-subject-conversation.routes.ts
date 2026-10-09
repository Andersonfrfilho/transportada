/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 260 T2.4 (api-contract): a conversa por assunto no `/me` do motorista — lista, abrir, mensagens e
 * leitura. Ler é `trip.read`; abrir é `trip.report`. O motorista é a ficha do vínculo do contexto (sem ficha,
 * a recusa `DRIVER_NOT_REGISTERED` das rotas `/me`). Toda resposta é `no-store`. As rotas de ocorrência
 * da 183 ficam em `me-occurrence-conversation.routes.ts`, intactas.
 */
import { z } from 'zod'

import {
  parseAgainstSchema,
  parseBody,
  parseUuidPathIdentifier,
  readListQuery,
} from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { decodeKeysetCursor, encodeKeysetCursor } from '../../shared/keyset-cursor.support.js'
import { DriverNotRegisteredError } from '../../trips/domain/trip.error.js'
import {
  OCCURRENCE_CONVERSATION_SUBJECT_TYPES,
  type OccurrenceConversationSubjectType,
} from '../../shared/occurrence-conversation-subject.constant.js'
import type { createListMySubjectConversationsUseCase } from '../application/list-my-subject-conversations.use-case.js'
import type { createListMySubjectMessagesUseCase } from '../application/list-my-subject-messages.use-case.js'
import type { createMarkMySubjectReadUseCase } from '../application/mark-my-subject-read.use-case.js'
import type { createOpenMySubjectConversationUseCase } from '../application/open-my-subject-conversation.use-case.js'
import {
  DRIVER_SUBJECT_MESSAGES_MAX_LIMIT,
  OPENABLE_SUBJECT_TYPES,
} from '../domain/driver-subject-conversation.constant.js'

const READ_POLICY = { permission: 'trip.read', scope: 'company' } as const
const REPORT_POLICY = { permission: 'trip.report', scope: 'company' } as const
const CONVERSATIONS_PATH = '/me/trips/current/conversations'
const OPEN_PATH = `${CONVERSATIONS_PATH}/open`
const MESSAGES_PATH = `${CONVERSATIONS_PATH}/:subjectType/:subjectId/messages`
const READ_PATH = `${MESSAGES_PATH}/read`

/** Abrir conversa cria linha: balde próprio, no Postgres, para um app em loop não encher a tabela. */
export const DRIVER_CONVERSATION_OPEN_RATE_LIMIT = {
  maxRequests: 20,
  scope: 'driver-conversation-open',
  store: 'postgres',
  windowSeconds: 300,
} as const

const subjectTypeSchema = z.enum(OCCURRENCE_CONVERSATION_SUBJECT_TYPES)
const openBodySchema = z
  .object({ subjectId: z.uuid(), subjectType: z.enum(OPENABLE_SUBJECT_TYPES) })
  .strict()
/** O mesmo formato do cursor das listagens: `<iso>::<uuid>`, e nada que a conversão arredonde. */
const cursorSchema = z.string().refine((value) => {
  const cursor = decodeKeysetCursor(value)
  return (
    cursor !== null && encodeKeysetCursor(cursor) === value && z.uuid().safeParse(cursor.id).success
  )
})
const messagesLimitSchema = z.coerce.number().int().min(1).max(DRIVER_SUBJECT_MESSAGES_MAX_LIMIT)

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
    status,
  })
}

type SubjectPath = {
  readonly subjectId: string
  readonly subjectType: OccurrenceConversationSubjectType
}

function parseSubjectPath(pathParameters: Readonly<Record<string, string>>): SubjectPath {
  return {
    subjectId: parseUuidPathIdentifier(pathParameters.subjectId ?? ''),
    subjectType: parseAgainstSchema(subjectTypeSchema, pathParameters.subjectType),
  }
}

export function createMeSubjectConversationRoutes(dependencies: {
  readonly list: Pick<ReturnType<typeof createListMySubjectConversationsUseCase>, 'list'>
  readonly markRead: Pick<ReturnType<typeof createMarkMySubjectReadUseCase>, 'markRead'>
  readonly messages: Pick<ReturnType<typeof createListMySubjectMessagesUseCase>, 'list'>
  readonly open: Pick<ReturnType<typeof createOpenMySubjectConversationUseCase>, 'open'>
  readonly resolveDriverId: (context: {
    readonly companyId: string
    readonly membershipId: string
  }) => Promise<null | string>
}): readonly ReturnType<typeof defineRoute>[] {
  async function resolveDriver(scope: {
    readonly companyId: string
    readonly membershipId: string
  }): Promise<string> {
    const driverId = await dependencies.resolveDriverId(scope)
    if (driverId === null) throw new DriverNotRegisteredError()
    return driverId
  }

  return [
    defineRoute<{ readonly cursor: null | string }>({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        const page = await dependencies.list.list({
          companyId: context.scope.companyId,
          cursor: input.cursor,
          driverId,
          driverUserId: context.scope.userId,
        })
        return jsonResponse({ data: page.data, pagination: { nextCursor: page.nextCursor } })
      },
      method: 'GET',
      parse: ({ request }) => {
        const cursor = readListQuery(new URL(request.url), new Set(['cursor'])).get('cursor')
        return { cursor: cursor === null ? null : parseAgainstSchema(cursorSchema, cursor) }
      },
      pathname: CONVERSATIONS_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<z.infer<typeof openBodySchema>>({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        const opened = await dependencies.open.open({
          ...input,
          companyId: context.scope.companyId,
          driverId,
          driverUserId: context.scope.userId,
        })
        return jsonResponse({ data: opened.summary }, opened.created ? 201 : 200)
      },
      method: 'POST',
      parse: ({ request }) => parseBody(openBodySchema, request),
      pathname: OPEN_PATH,
      policy: REPORT_POLICY,
      rateLimit: DRIVER_CONVERSATION_OPEN_RATE_LIMIT,
    }),
    defineRoute<SubjectPath & { readonly before?: string; readonly limit?: number }>({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        const data = await dependencies.messages.list({
          ...input,
          companyId: context.scope.companyId,
          driverId,
          driverUserId: context.scope.userId,
        })
        return jsonResponse({ data })
      },
      method: 'GET',
      parse: ({ pathParameters, request }) => {
        const query = readListQuery(new URL(request.url), new Set(['before', 'limit']))
        const before = query.get('before')
        const limit = query.get('limit')
        return {
          ...parseSubjectPath(pathParameters),
          ...(before === null ? {} : { before: parseUuidPathIdentifier(before) }),
          ...(limit === null ? {} : { limit: parseAgainstSchema(messagesLimitSchema, limit) }),
        }
      },
      pathParameterFormat: 'raw',
      pathname: MESSAGES_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<SubjectPath>({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        await dependencies.markRead.markRead({
          ...input,
          companyId: context.scope.companyId,
          driverId,
          driverUserId: context.scope.userId,
        })
        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'POST',
      parse: ({ pathParameters }) => parseSubjectPath(pathParameters),
      pathParameterFormat: 'raw',
      pathname: READ_PATH,
      policy: READ_POLICY,
    }),
  ]
}
