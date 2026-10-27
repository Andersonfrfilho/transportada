/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T5 (RF3/RF5): o boleto da contratante por WhatsApp (Evolution) ao cliente da nota, pelo painel. A empresa
 * vem do contexto, nunca do corpo; o número sai só mascarado. Todo erro `WHATSAPP_*`, `OCCURRENCE_CLIENT_WHATSAPP_OFF`
 * e `WHATSAPP_EVOLUTION_*` quer dizer "use o e-mail": a tela oferece a rota de e-mail da 279 no lugar.
 */
import { z } from 'zod'

import { parseIdempotencyKey } from '../../cte-batches/presentation/cte-batch.schema.js'
import {
  invalidRequest,
  parseBody,
  parseUuidPathIdentifier,
} from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import { DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE } from '../../shared/delivery-client-email.constant.js'
import type { ContractorReplyWhatsAppReaderPort } from '../application/forward-contractor-reply-by-whatsapp.port.js'
import type {
  ForwardContractorReplyByWhatsAppOutcome,
  ForwardContractorReplyByWhatsAppUseCase,
} from '../application/forward-contractor-reply-by-whatsapp.use-case.js'
import { OCCURRENCE_CONVERSATION_RATE_LIMIT } from './occurrence-conversation.routes.js'
import { TripOccurrenceNotFoundError } from '../../trips/domain/trip.error.js'

export const OCCURRENCE_CONTRACTOR_REPLY_WHATSAPP_DELIVERY_PATH =
  '/trip-occurrences/:id/contractor-reply/whatsapp-delivery'
/** "Tentar de novo" (falhou) e "Reenviar" (já saiu): o número e o anexo vêm da entrega. */
export const OCCURRENCE_CONTRACTOR_REPLY_WHATSAPP_RESEND_PATH =
  '/trip-occurrences/:id/contractor-reply/whatsapp-deliveries/:deliveryId/resend'
export const OCCURRENCE_CONTRACTOR_REPLY_WHATSAPP_OPTIONS_PATH =
  '/trip-occurrences/:id/contractor-reply/whatsapp-options'

const READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const
const WRITE_POLICY = { permission: 'occurrences.resolve', scope: 'company' } as const

/** O teto do texto bruto só protege o parser: quem decide o número é a política do domínio (D4). */
export const WHATSAPP_DELIVERY_BODY_SCHEMA = z
  .object({
    attachmentId: z.string().uuid().optional(),
    contactIds: z
      .array(z.string().uuid())
      .min(1)
      .max(DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE)
      .optional(),
    number: z.string().max(100).optional(),
    /** Guardar o número novo no cadastro do cliente; só com `number`. */
    save: z.boolean().optional(),
  })
  .strict()
  .readonly()

export function assertWhatsAppBodyFits(body: {
  readonly contactIds?: readonly string[] | undefined
  readonly number?: string | undefined
  readonly save?: boolean | undefined
}): void {
  if ((body.contactIds?.length ?? 0) === 0 && body.number === undefined) {
    throw invalidRequest([{ field: 'contactIds', message: 'Choose a saved number or enter one' }])
  }
  if (body.save === true && body.number === undefined) {
    throw invalidRequest([{ field: 'save', message: 'Only a new number can be saved' }])
  }
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status,
  })
}

/** 201 quando algum número recebeu agora; o replay e a falha respondem 200 com o resultado por número. */
export function whatsappOutcomeResponse(
  outcome: ForwardContractorReplyByWhatsAppOutcome,
): Response {
  const isSent = outcome.results.some((result) => result.kind === 'sent')
  return jsonResponse({ data: outcome }, isSent ? 201 : 200)
}

export function createOccurrenceContractorReplyWhatsAppRoutes(dependencies: {
  readonly forwardByWhatsApp: ForwardContractorReplyByWhatsAppUseCase
  readonly whatsappOptions: ContractorReplyWhatsAppReaderPort
}): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{
      readonly attachmentId?: string
      readonly contactIds: readonly string[]
      readonly correlationId: string
      readonly idempotencyKey: string
      readonly number?: string
      readonly occurrenceId: string
      readonly save: boolean
    }>({
      async handle({ context, input }): Promise<Response> {
        const outcome = await dependencies.forwardByWhatsApp.forward({
          actorUserId: context.scope.userId,
          ...(input.attachmentId === undefined ? {} : { attachmentId: input.attachmentId }),
          authorKind: 'office',
          companyId: context.scope.companyId,
          contactIds: input.contactIds,
          correlationId: input.correlationId,
          idempotencyKey: input.idempotencyKey,
          ...(input.number === undefined ? {} : { number: input.number }),
          occurrenceId: input.occurrenceId,
          save: input.save,
        })
        return whatsappOutcomeResponse(outcome)
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const occurrenceId = parseUuidPathIdentifier(pathParameters.id ?? '')
        const idempotencyKey = parseIdempotencyKey(request.headers.get('idempotency-key'))
        const body = await parseBody(WHATSAPP_DELIVERY_BODY_SCHEMA, request)
        assertWhatsAppBodyFits(body)
        return {
          ...(body.attachmentId === undefined ? {} : { attachmentId: body.attachmentId }),
          contactIds: body.contactIds ?? [],
          correlationId,
          idempotencyKey,
          ...(body.number === undefined ? {} : { number: body.number }),
          occurrenceId,
          save: body.save ?? false,
        }
      },
      pathname: OCCURRENCE_CONTRACTOR_REPLY_WHATSAPP_DELIVERY_PATH,
      policy: WRITE_POLICY,
      rateLimit: OCCURRENCE_CONVERSATION_RATE_LIMIT,
    }),
    defineRoute<{
      readonly correlationId: string
      readonly deliveryId: string
      readonly idempotencyKey: string
      readonly occurrenceId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const outcome = await dependencies.forwardByWhatsApp.resend({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          deliveryId: input.deliveryId,
          idempotencyKey: input.idempotencyKey,
          occurrenceId: input.occurrenceId,
        })
        return whatsappOutcomeResponse(outcome)
      },
      method: 'POST',
      parse: ({ correlationId, pathParameters, request }) => ({
        correlationId,
        deliveryId: parseUuidPathIdentifier(pathParameters.deliveryId ?? ''),
        idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
        occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: OCCURRENCE_CONTRACTOR_REPLY_WHATSAPP_RESEND_PATH,
      policy: WRITE_POLICY,
      rateLimit: OCCURRENCE_CONVERSATION_RATE_LIMIT,
    }),
    defineRoute<{ readonly occurrenceId: string }>({
      async handle({ context, input }): Promise<Response> {
        const options = await dependencies.whatsappOptions.read({
          companyId: context.scope.companyId,
          occurrenceId: input.occurrenceId,
        })
        if (options === null) throw new TripOccurrenceNotFoundError()
        return jsonResponse({ data: options })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: OCCURRENCE_CONTRACTOR_REPLY_WHATSAPP_OPTIONS_PATH,
      policy: READ_POLICY,
    }),
  ]
}
