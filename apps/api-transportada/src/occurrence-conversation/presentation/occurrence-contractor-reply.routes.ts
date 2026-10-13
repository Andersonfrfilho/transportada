/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 248 RF7/RF9 (T4.6): o operador leva o boleto da contratante ao motorista pelo chat do app.
 * `occurrences.resolve`; a empresa vem do contexto, nunca do corpo; sem `attachmentId` vale o anexo aceito do
 * retorno, e com ele qualquer anexo da conversa da contratante desta ocorrência (RF9).
 */
import { z } from 'zod'

import { parseIdempotencyKey } from '../../cte-batches/presentation/cte-batch.schema.js'
import {
  invalidRequest,
  parseBody,
  parseOptionalBody,
  parseUuidPathIdentifier,
} from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import { CONTRACTOR_REPLY_EMAIL_TARGETS } from '../../shared/occurrence-contractor-reply.constant.js'
import type { createDeliverContractorReplyToDriverUseCase } from '../application/deliver-contractor-reply-to-driver.use-case.js'
import type { ContractorReplyEmailReaderPort } from '../application/forward-contractor-reply-by-email.port.js'
import type {
  ForwardContractorReplyByEmailInput,
  ForwardContractorReplyByEmailUseCase,
} from '../application/forward-contractor-reply-by-email.use-case.js'
import { OCCURRENCE_CONVERSATION_RATE_LIMIT } from './occurrence-conversation.routes.js'

export const OCCURRENCE_CONTRACTOR_REPLY_DRIVER_DELIVERY_PATH =
  '/trip-occurrences/:id/contractor-reply/driver-delivery'
export const OCCURRENCE_CONTRACTOR_REPLY_EMAIL_DELIVERY_PATH =
  '/trip-occurrences/:id/contractor-reply/email-delivery'
export const OCCURRENCE_CONTRACTOR_REPLY_EMAIL_OPTIONS_PATH =
  '/trip-occurrences/:id/contractor-reply/email-options'

const WRITE_POLICY = { permission: 'occurrences.resolve', scope: 'company' } as const

const BODY_SCHEMA = z.object({ attachmentId: z.string().uuid().optional() }).strict().readonly()

/** O teto do texto bruto só protege o parser: quem decide o endereço é a política do domínio (RF11). */
const EMAIL_BODY_SCHEMA = z
  .object({
    address: z.string().max(1000).optional(),
    attachmentId: z.string().uuid().optional(),
    target: z.enum(CONTRACTOR_REPLY_EMAIL_TARGETS),
  })
  .strict()
  .readonly()

export type OccurrenceContractorReplyRoutesDependencies = {
  readonly deliverToDriver: Pick<
    ReturnType<typeof createDeliverContractorReplyToDriverUseCase>,
    'deliver'
  >
  readonly emailOptions: ContractorReplyEmailReaderPort
  readonly forwardByEmail: Pick<ForwardContractorReplyByEmailUseCase, 'forward'>
}

type DriverDeliveryInput = {
  readonly attachmentId?: string
  readonly occurrenceId: string
}

type EmailDeliveryInput = Omit<ForwardContractorReplyByEmailInput, 'actorUserId' | 'companyId'>

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status,
  })
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
    /** Spec 248 T4.7 (RF10/RF11): o boleto ao cliente da nota ou a um e-mail informado. */
    defineRoute<EmailDeliveryInput>({
      async handle({ context, input }): Promise<Response> {
        const outcome = await dependencies.forwardByEmail.forward({
          ...input,
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
        })
        return jsonResponse({ data: outcome }, outcome.kind === 'queued' ? 201 : 200)
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const occurrenceId = parseUuidPathIdentifier(pathParameters.id ?? '')
        const idempotencyKey = parseIdempotencyKey(request.headers.get('idempotency-key'))
        const body = await parseBody(EMAIL_BODY_SCHEMA, request)
        if (body.target === 'note_recipient_email' && body.address !== undefined) {
          throw invalidRequest([
            { field: 'address', message: 'The note recipient address comes from the note' },
          ])
        }
        return {
          ...(body.address === undefined ? {} : { address: body.address }),
          ...(body.attachmentId === undefined ? {} : { attachmentId: body.attachmentId }),
          correlationId,
          idempotencyKey,
          occurrenceId,
          target: body.target,
        }
      },
      pathname: OCCURRENCE_CONTRACTOR_REPLY_EMAIL_DELIVERY_PATH,
      policy: WRITE_POLICY,
      rateLimit: OCCURRENCE_CONVERSATION_RATE_LIMIT,
    }),
    defineRoute<{ readonly occurrenceId: string }>({
      async handle({ context, input }): Promise<Response> {
        const options = await dependencies.emailOptions.read({
          companyId: context.scope.companyId,
          occurrenceId: input.occurrenceId,
        })
        return jsonResponse({ data: options }, 200)
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: OCCURRENCE_CONTRACTOR_REPLY_EMAIL_OPTIONS_PATH,
      policy: WRITE_POLICY,
    }),
  ]
}
