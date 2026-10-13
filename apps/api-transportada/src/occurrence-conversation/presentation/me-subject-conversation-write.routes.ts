/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4 (api-contract): o lado de escrita da conversa por assunto no `/me` do motorista — responder e
 * pedir a subida de um anexo. Os limites são os mesmos objetos das rotas antigas: o balde é compartilhado, e
 * alternar de rota não dobra a cota. O corpo da resposta é o mesmo `replySchema`; o `201` é a primeira vez e o
 * `200`, a repetição da chave.
 */
import { parseIdempotencyKey } from '../../cte-batches/presentation/cte-batch.schema.js'
import { parseBody } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { DriverNotRegisteredError } from '../../trips/domain/trip.error.js'
import type { createReplyMySubjectConversationUseCase } from '../application/reply-my-subject-conversation.use-case.js'
import type { createRequestMySubjectUploadUseCase } from '../application/request-my-subject-upload.use-case.js'
import { conversationUploadSchema } from './conversation-attachment.schema.js'
import {
  DRIVER_CONVERSATION_SEND_RATE_LIMIT,
  DRIVER_CONVERSATION_UPLOAD_RATE_LIMIT,
  replySchema,
} from './me-occurrence-conversation.routes.js'
import {
  jsonResponse,
  parseSubjectPath,
  SUBJECT_PATH,
  type SubjectPath,
} from './me-subject-conversation.routes.js'

const REPORT_POLICY = { permission: 'trip.report', scope: 'company' } as const

export function createMeSubjectConversationWriteRoutes(dependencies: {
  readonly reply: Pick<ReturnType<typeof createReplyMySubjectConversationUseCase>, 'reply'>
  readonly requestUpload: Pick<ReturnType<typeof createRequestMySubjectUploadUseCase>, 'request'>
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
    defineRoute<
      SubjectPath & {
        readonly attachmentIds: readonly string[]
        readonly bodyText: string
        readonly idempotencyKey: string
      }
    >({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        const result = await dependencies.reply.reply({
          ...input,
          companyId: context.scope.companyId,
          driverId,
          driverUserId: context.scope.userId,
        })
        return jsonResponse({ data: result.message }, result.replayed ? 200 : 201)
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const subject = parseSubjectPath(pathParameters)
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
      pathname: `${SUBJECT_PATH}/messages`,
      policy: REPORT_POLICY,
      rateLimit: DRIVER_CONVERSATION_SEND_RATE_LIMIT,
    }),
    defineRoute<
      SubjectPath & {
        readonly contentType: string
        readonly fileName: string
        readonly sizeBytes: number
      }
    >({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        const data = await dependencies.requestUpload.request({
          ...input,
          companyId: context.scope.companyId,
          driverId,
          driverUserId: context.scope.userId,
        })
        return jsonResponse({ data }, 201)
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const subject = parseSubjectPath(pathParameters)
        return { ...subject, ...(await parseBody(conversationUploadSchema, request)) }
      },
      pathParameterFormat: 'raw',
      pathname: `${SUBJECT_PATH}/uploads`,
      policy: REPORT_POLICY,
      rateLimit: DRIVER_CONVERSATION_UPLOAD_RATE_LIMIT,
    }),
  ]
}
