/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF7/RF9 (T4.6): o operador leva o boleto da contratante ao motorista pelo chat do app.
 * `occurrences.resolve`; a empresa vem do contexto, nunca do corpo; sem `attachmentId` vale o anexo aceito do
 * retorno, e com ele qualquer anexo da conversa da contratante desta ocorrência (RF9).
 */
import { z } from 'zod'

import { parseOptionalBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { createDeliverContractorReplyToDriverUseCase } from '../application/deliver-contractor-reply-to-driver.use-case.js'
import { OCCURRENCE_CONVERSATION_RATE_LIMIT } from './occurrence-conversation.routes.js'

export const OCCURRENCE_CONTRACTOR_REPLY_DRIVER_DELIVERY_PATH =
  '/trip-occurrences/:id/contractor-reply/driver-delivery'

const WRITE_POLICY = { permission: 'occurrences.resolve', scope: 'company' } as const

const BODY_SCHEMA = z.object({ attachmentId: z.string().uuid().optional() }).strict().readonly()

export type OccurrenceContractorReplyRoutesDependencies = {
  readonly deliverToDriver: Pick<
    ReturnType<typeof createDeliverContractorReplyToDriverUseCase>,
    'deliver'
  >
}

type DriverDeliveryInput = {
  readonly attachmentId?: string
  readonly occurrenceId: string
}

export function createOccurrenceContractorReplyRoutes(
  dependencies: OccurrenceContractorReplyRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<DriverDeliveryInput>({
      async handle({ context, input }): Promise<Response> {
        const outcome = await dependencies.deliverToDriver.deliver({
          actorUserId: context.scope.userId,
          ...(input.attachmentId === undefined ? {} : { attachmentId: input.attachmentId }),
          companyId: context.scope.companyId,
          occurrenceId: input.occurrenceId,
        })
        return new Response(JSON.stringify({ data: outcome }), {
          headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
          status: outcome.kind === 'delivered' ? 201 : 200,
        })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseOptionalBody(BODY_SCHEMA, request)
        return {
          ...(body?.attachmentId === undefined ? {} : { attachmentId: body.attachmentId }),
          occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: OCCURRENCE_CONTRACTOR_REPLY_DRIVER_DELIVERY_PATH,
      policy: WRITE_POLICY,
      rateLimit: OCCURRENCE_CONVERSATION_RATE_LIMIT,
    }),
  ]
}
