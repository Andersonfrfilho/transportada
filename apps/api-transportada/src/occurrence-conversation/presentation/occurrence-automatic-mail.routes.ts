/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 T4.4b: a porta do robô da varredura `occurrence.automatic-mail.sweep`. O worker acha a
 * ocorrência que o aviso automático não alcançou e pede o envio; a API decide e grava. `companyId`
 * vem do contexto, nunca do corpo, e a permissão é só do serviço (`occurrence.automatic-mail`).
 */
import { z } from 'zod'

import { parseOptionalBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import type { AutomaticOccurrenceMailResult } from '../application/send-automatic-occurrence-mail.use-case.js'
import {
  OccurrenceConversationIdempotencyKeyReusedError,
  OccurrenceConversationNotFoundError,
} from '../domain/occurrence-conversation.error.js'

export const OCCURRENCE_AUTOMATIC_MAIL_PATH = '/trip-occurrences/:id/automatic-mail'

const AUTOMATIC_MAIL_POLICY = { permission: 'occurrence.automatic-mail', scope: 'company' } as const

const EMPTY_BODY_SCHEMA = z.object({}).strict().readonly()

export type OccurrenceAutomaticMailRoutesDependencies = {
  readonly sendAutomaticMail: {
    send(input: {
      readonly companyId: string
      readonly correlationId: string
      readonly occurrenceId: string
    }): Promise<AutomaticOccurrenceMailResult>
  }
}

type AutomaticMailRouteInput = {
  readonly correlationId: string
  readonly occurrenceId: string
}

function jsonResponse(body: object): Response {
  return new Response(JSON.stringify({ data: body }), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status: 200,
  })
}

export function createOccurrenceAutomaticMailRoutes(
  dependencies: OccurrenceAutomaticMailRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<AutomaticMailRouteInput>({
      async handle({ context, input }) {
        try {
          const result = await dependencies.sendAutomaticMail.send({
            companyId: context.scope.companyId,
            correlationId: input.correlationId,
            occurrenceId: input.occurrenceId,
          })
          if (result.outcome === 'sent') return jsonResponse(result)
          if (result.reason === 'not_document') throw new OccurrenceConversationNotFoundError()
          return jsonResponse(result)
        } catch (error) {
          if (error instanceof OccurrenceConversationIdempotencyKeyReusedError) {
            return jsonResponse({ outcome: 'already_sent' })
          }
          throw error
        }
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        await parseOptionalBody(EMPTY_BODY_SCHEMA, request)
        return { correlationId, occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? '') }
      },
      pathname: OCCURRENCE_AUTOMATIC_MAIL_PATH,
      policy: AUTOMATIC_MAIL_POLICY,
    }),
  ]
}
