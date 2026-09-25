/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T651 (RF21, D9, ADR-0073): as rotas da conversa da contratante no portal. Todas em
 * `/client/me/occurrence-conversations/:ref`, com a referência opaca (`pathParameterFormat:
 * 'opaque'`) — nenhuma recebe id interno —, `deliveries.track` (quem acompanha a carga conversa sobre
 * ela; decidir continua na rota da 164) e `cache-control: no-store`. O recorte é do caso de uso, a
 * partir do contexto; o corpo do envio aceita só `{ body }`.
 *
 * Teto no Postgres por balde, como as rotas da 164: ler e marcar como lida são frequentes; escrever
 * é mais raro e grava.
 */
import { z } from 'zod'

import { parseIdempotencyKey } from '../../cte-batches/presentation/cte-batch.schema.js'
import { parseBody } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import type { CompanyContext } from '../../identity/domain/tenant-context.js'
import {
  API_CLIENT_OCCURRENCE_CONVERSATIONS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type { ContractorPortalConversationUseCase } from '../application/contractor-portal-conversation.use-case.js'
import { OCCURRENCE_MAIL_LIMITS } from '../domain/occurrence-conversation.constant.js'

const TRACK_POLICY = { permission: 'deliveries.track', scope: 'company' } as const

const CONVERSATION_PATH = `${API_CLIENT_OCCURRENCE_CONVERSATIONS_PATH}/:ref`

const READ_RATE_LIMIT = {
  maxRequests: 120,
  scope: 'contractor-occurrence-conversation-read',
  store: 'postgres',
  windowSeconds: 300,
} as const

const SEND_RATE_LIMIT = {
  maxRequests: 30,
  scope: 'contractor-occurrence-conversation-send',
  store: 'postgres',
  windowSeconds: 300,
} as const

const sendSchema = z.object({ body: z.string().max(OCCURRENCE_MAIL_LIMITS.body) }).strict()

type RefInput = { readonly ref: string }

export type ClientOccurrenceConversationRoutesDependencies = {
  readonly conversation: ContractorPortalConversationUseCase
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status,
  })
}

function scopeOf(context: { readonly scope: CompanyContext }): CompanyContext {
  return context.scope
}

export function createClientOccurrenceConversationRoutes(
  dependencies: ClientOccurrenceConversationRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<RefInput>({
      async handle({ context, input }): Promise<Response> {
        const data = await dependencies.conversation.read({
          context: scopeOf(context),
          ref: input.ref,
        })
        return jsonResponse({ data })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({ ref: pathParameters.ref ?? '' }),
      pathParameterFormat: 'opaque',
      pathname: CONVERSATION_PATH,
      policy: TRACK_POLICY,
      rateLimit: READ_RATE_LIMIT,
    }),
    defineRoute<RefInput & { readonly bodyText: string; readonly idempotencyKey: string }>({
      async handle({ context, input }): Promise<Response> {
        const data = await dependencies.conversation.send({
          bodyText: input.bodyText,
          context: scopeOf(context),
          idempotencyKey: input.idempotencyKey,
          ref: input.ref,
        })
        return jsonResponse({ data }, 201)
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const idempotencyKey = parseIdempotencyKey(request.headers.get('idempotency-key'))
        const body = await parseBody(sendSchema, request)
        return { bodyText: body.body, idempotencyKey, ref: pathParameters.ref ?? '' }
      },
      pathParameterFormat: 'opaque',
      pathname: `${CONVERSATION_PATH}/messages`,
      policy: TRACK_POLICY,
      rateLimit: SEND_RATE_LIMIT,
    }),
    defineRoute<RefInput>({
      async handle({ context, input }): Promise<Response> {
        await dependencies.conversation.markRead({ context: scopeOf(context), ref: input.ref })
        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'POST',
      parse: ({ pathParameters }) => ({ ref: pathParameters.ref ?? '' }),
      pathParameterFormat: 'opaque',
      pathname: `${CONVERSATION_PATH}/read`,
      policy: TRACK_POLICY,
      rateLimit: READ_RATE_LIMIT,
    }),
  ]
}
