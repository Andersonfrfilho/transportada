/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T601 (RF11): a conversa da ocorrência no `/me` do motorista. Ler é `trip.read` e
 * responder é `trip.report`, as chaves das rotas `/me`; o motorista é a ficha do vínculo do
 * contexto (sem ficha, a mesma recusa `DRIVER_NOT_REGISTERED` das outras rotas `/me`), e só a
 * ocorrência de viagem em que ele está na tripulação é alcançada. Toda resposta é `no-store`.
 */
import { z } from 'zod'

import { parseIdempotencyKey } from '../../cte-batches/presentation/cte-batch.schema.js'
import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { DriverNotRegisteredError } from '../../trips/domain/trip.error.js'
import type {
  createListMyOccurrenceConversationUseCase,
  createReplyMyOccurrenceConversationUseCase,
} from '../application/driver-conversation.use-case.js'
import { OCCURRENCE_MAIL_LIMITS } from '../domain/occurrence-conversation.constant.js'

const READ_POLICY = { permission: 'trip.read', scope: 'company' } as const
const REPORT_POLICY = { permission: 'trip.report', scope: 'company' } as const
const MESSAGES_PATH = '/me/trips/current/occurrences/:id/messages'

const replySchema = z.object({ body: z.string().max(OCCURRENCE_MAIL_LIMITS.body) }).strict()

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
    status,
  })
}

export function createMeOccurrenceConversationRoutes(dependencies: {
  readonly list: Pick<ReturnType<typeof createListMyOccurrenceConversationUseCase>, 'list'>
  readonly reply: Pick<ReturnType<typeof createReplyMyOccurrenceConversationUseCase>, 'reply'>
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
    defineRoute<{ readonly occurrenceId: string }>({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        const data = await dependencies.list.list({
          companyId: context.scope.companyId,
          driverId,
          driverUserId: context.scope.userId,
          occurrenceId: input.occurrenceId,
        })
        return jsonResponse({ data })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: MESSAGES_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<{
      readonly bodyText: string
      readonly idempotencyKey: string
      readonly occurrenceId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        const data = await dependencies.reply.reply({
          bodyText: input.bodyText,
          companyId: context.scope.companyId,
          driverId,
          driverUserId: context.scope.userId,
          idempotencyKey: input.idempotencyKey,
          occurrenceId: input.occurrenceId,
        })
        return jsonResponse({ data }, 201)
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const occurrenceId = parseUuidPathIdentifier(pathParameters.id ?? '')
        const idempotencyKey = parseIdempotencyKey(request.headers.get('idempotency-key'))
        const body = await parseBody(replySchema, request)
        return { bodyText: body.body, idempotencyKey, occurrenceId }
      },
      pathname: MESSAGES_PATH,
      policy: REPORT_POLICY,
    }),
  ]
}
