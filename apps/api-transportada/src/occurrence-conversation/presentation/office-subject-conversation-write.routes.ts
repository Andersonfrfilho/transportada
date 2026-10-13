/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4b (api-contract, "Rotas do escritório"): o lado de escrita da conversa de nota e de viagem
 * vista pelo escritório — abrir (que também reabre), enviar ao motorista, pedir a subida de um anexo e
 * encerrar. Escrever é `trip.manage` (quem despacha fala com o motorista); a ocorrência segue com
 * `occurrences.resolve`, em outras rotas. Envio e subida usam os mesmos objetos de limite das rotas
 * antigas do escritório: o balde é compartilhado, e alternar de rota não dobra a cota. Abrir e encerrar
 * gravam linha, num balde próprio no Postgres. O corpo do envio é o `replySchema`.
 */
import { z } from 'zod'

import { parseIdempotencyKey } from '../../cte-batches/presentation/cte-batch.schema.js'
import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import type { createCloseTripSubjectConversationUseCase } from '../application/close-trip-subject-conversation.use-case.js'
import type { createOpenTripSubjectConversationUseCase } from '../application/open-trip-subject-conversation.use-case.js'
import type { createRequestOfficeSubjectUploadUseCase } from '../application/request-office-subject-upload.use-case.js'
import type { createSendOfficeSubjectMessageUseCase } from '../application/send-office-subject-message.use-case.js'
import { OPENABLE_SUBJECT_TYPES } from '../domain/driver-subject-conversation.constant.js'
import { conversationUploadSchema } from './conversation-attachment.schema.js'
import { replySchema } from './me-occurrence-conversation.routes.js'
import {
  OCCURRENCE_CONVERSATION_RATE_LIMIT,
  OCCURRENCE_CONVERSATION_UPLOAD_RATE_LIMIT,
} from './occurrence-conversation.routes.js'
import {
  jsonResponse,
  parseOfficeSubjectPath,
  TRIP_CONVERSATIONS_PATH,
  TRIP_SUBJECT_PATH,
  type OfficeSubjectPath,
} from './office-subject-conversation.routes.js'

const WRITE_POLICY = { permission: 'trip.manage', scope: 'company' } as const

/** Abrir e encerrar gravam linha: balde próprio, no Postgres, para uma tela em loop não encher a tabela. */
export const OFFICE_SUBJECT_CONVERSATION_STATE_RATE_LIMIT = {
  maxRequests: 60,
  scope: 'office-subject-conversation-state',
  store: 'postgres',
  windowSeconds: 300,
} as const

const openBodySchema = z
  .object({ subjectId: z.uuid(), subjectType: z.enum(OPENABLE_SUBJECT_TYPES) })
  .strict()

type Dependencies = {
  readonly close: Pick<ReturnType<typeof createCloseTripSubjectConversationUseCase>, 'close'>
  readonly open: Pick<ReturnType<typeof createOpenTripSubjectConversationUseCase>, 'open'>
  readonly requestUpload: Pick<
    ReturnType<typeof createRequestOfficeSubjectUploadUseCase>,
    'request'
  >
  readonly send: Pick<ReturnType<typeof createSendOfficeSubjectMessageUseCase>, 'send'>
}

function createOpenAndCloseRoutes(dependencies: Dependencies) {
  return [
    defineRoute<OfficeSubjectPath>({
      async handle({ context, input }): Promise<Response> {
        const opened = await dependencies.open.open({
          ...input,
          companyId: context.scope.companyId,
          userId: context.scope.userId,
        })
        return jsonResponse({ data: opened.summary }, opened.created ? 201 : 200)
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseBody(openBodySchema, request)
        return {
          subjectId: body.subjectId,
          subjectType: body.subjectType,
          tripId: parseUuidPathIdentifier(pathParameters.tripId ?? ''),
        }
      },
      pathname: `${TRIP_CONVERSATIONS_PATH}/open`,
      policy: WRITE_POLICY,
      rateLimit: OFFICE_SUBJECT_CONVERSATION_STATE_RATE_LIMIT,
    }),
    defineRoute<OfficeSubjectPath>({
      async handle({ context, input }): Promise<Response> {
        const data = await dependencies.close.close({
          ...input,
          companyId: context.scope.companyId,
          userId: context.scope.userId,
        })
        return jsonResponse({ data })
      },
      method: 'POST',
      parse: ({ pathParameters }) => parseOfficeSubjectPath(pathParameters),
      pathParameterFormat: 'raw',
      pathname: `${TRIP_SUBJECT_PATH}/close`,
      policy: WRITE_POLICY,
      rateLimit: OFFICE_SUBJECT_CONVERSATION_STATE_RATE_LIMIT,
    }),
  ]
}

export function createOfficeSubjectConversationWriteRoutes(
  dependencies: Dependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    ...createOpenAndCloseRoutes(dependencies),
    defineRoute<
      OfficeSubjectPath & {
        readonly attachmentIds: readonly string[]
        readonly bodyText: string
        readonly idempotencyKey: string
      }
    >({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.send.send({
          ...input,
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
        })
        return jsonResponse({ data: result.message }, result.replayed ? 200 : 201)
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const subject = parseOfficeSubjectPath(pathParameters)
        const idempotencyKey = parseIdempotencyKey(request.headers.get('idempotency-key'))
        const body = await parseBody(replySchema, request)
        return {
          ...subject,
          attachmentIds: body.attachmentIds ?? [],
          bodyText: body.body,
          idempotencyKey,
        }
      },
      pathParameterFormat: 'raw',
      pathname: `${TRIP_SUBJECT_PATH}/messages`,
      policy: WRITE_POLICY,
      rateLimit: OCCURRENCE_CONVERSATION_RATE_LIMIT,
    }),
    defineRoute<
      OfficeSubjectPath & {
        readonly contentType: string
        readonly fileName: string
        readonly sizeBytes: number
      }
    >({
      async handle({ context, input }): Promise<Response> {
        const data = await dependencies.requestUpload.request({
          ...input,
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
        })
        return jsonResponse({ data }, 201)
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const subject = parseOfficeSubjectPath(pathParameters)
        return { ...subject, ...(await parseBody(conversationUploadSchema, request)) }
      },
      pathParameterFormat: 'raw',
      pathname: `${TRIP_SUBJECT_PATH}/uploads`,
      policy: WRITE_POLICY,
      rateLimit: OCCURRENCE_CONVERSATION_UPLOAD_RATE_LIMIT,
    }),
  ]
}
