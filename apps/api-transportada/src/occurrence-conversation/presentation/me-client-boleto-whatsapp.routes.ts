/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 281 T5 (RF3): o motorista manda o boleto ao WhatsApp do cliente pelo app, no mesmo trilho do painel. Só a
 * ocorrência da viagem dele (a mesma conferência do "Enviar ao cliente" da 279); a chave do pedido vem no corpo, como
 * na fila offline do app, e o mesmo toque repetido não duplica. Ele lê só números mascarados.
 */
import { z } from 'zod'

import { parseIdempotencyKey } from '../../cte-batches/presentation/cte-batch.schema.js'
import { parseBody, parseUuidPathIdentifier } from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import { JSON_CONTENT_TYPE } from '../../shared/api.constant.js'
import { DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE } from '../../shared/delivery-client-email.constant.js'
import {
  DriverNotRegisteredError,
  TripOccurrenceNotFoundError,
} from '../../trips/domain/trip.error.js'
import type { ContractorReplyWhatsAppReaderPort } from '../application/forward-contractor-reply-by-whatsapp.port.js'
import type { ForwardContractorReplyByWhatsAppUseCase } from '../application/forward-contractor-reply-by-whatsapp.use-case.js'
import { DRIVER_CLIENT_BOLETO_EMAIL_SEND_RATE_LIMIT } from './me-client-boleto-emails.routes.js'
import {
  assertWhatsAppBodyFits,
  whatsappOutcomeResponse,
} from './occurrence-contractor-reply-whatsapp.routes.js'

const READ_POLICY = { permission: 'trip.read', scope: 'company' } as const
const REPORT_POLICY = { permission: 'trip.report', scope: 'company' } as const
const WHATSAPP_PATH = '/me/trips/current/occurrences/:id/client-boleto-whatsapp'
const SEND_PATH = `${WHATSAPP_PATH}/send`

/** O mesmo balde do envio por e-mail do app: os dois escrevem no trilho de entrega do cliente. */
const SEND_RATE_LIMIT = DRIVER_CLIENT_BOLETO_EMAIL_SEND_RATE_LIMIT

const SEND_BODY_SCHEMA = z
  .object({
    contactIds: z.array(z.string().uuid()).max(DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE).optional(),
    idempotencyKey: z.string().max(200),
    number: z.string().max(100).optional(),
    save: z.boolean().optional(),
  })
  .strict()
  .readonly()

export function createMeClientBoletoWhatsAppRoutes(dependencies: {
  readonly findMyOccurrence: (input: {
    readonly companyId: string
    readonly driverId: string
    readonly occurrenceId: string
  }) => Promise<unknown>
  readonly forwardByWhatsApp: Pick<ForwardContractorReplyByWhatsAppUseCase, 'forward'>
  readonly resolveDriverId: (context: {
    readonly companyId: string
    readonly membershipId: string
  }) => Promise<null | string>
  readonly whatsappOptions: ContractorReplyWhatsAppReaderPort
}): readonly ReturnType<typeof defineRoute>[] {
  /** A tripulação da viagem: ocorrência de outra viagem responde como inexistente. */
  async function assertMine(scope: {
    readonly companyId: string
    readonly membershipId: string
    readonly occurrenceId: string
  }): Promise<void> {
    const driverId = await dependencies.resolveDriverId(scope)
    if (driverId === null) throw new DriverNotRegisteredError()
    const occurrence = await dependencies.findMyOccurrence({
      companyId: scope.companyId,
      driverId,
      occurrenceId: scope.occurrenceId,
    })
    if (occurrence === null) throw new TripOccurrenceNotFoundError()
  }

  return [
    defineRoute<{ readonly occurrenceId: string }>({
      async handle({ context, input }): Promise<Response> {
        await assertMine({ ...context.scope, occurrenceId: input.occurrenceId })
        const options = await dependencies.whatsappOptions.read({
          companyId: context.scope.companyId,
          occurrenceId: input.occurrenceId,
        })
        if (options === null) throw new TripOccurrenceNotFoundError()
        return new Response(JSON.stringify({ data: options }), {
          headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
          status: 200,
        })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: WHATSAPP_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<{
      readonly contactIds: readonly string[]
      readonly correlationId: string
      readonly idempotencyKey: string
      readonly number?: string
      readonly occurrenceId: string
      readonly save: boolean
    }>({
      async handle({ context, input }): Promise<Response> {
        await assertMine({ ...context.scope, occurrenceId: input.occurrenceId })
        const outcome = await dependencies.forwardByWhatsApp.forward({
          actorUserId: context.scope.userId,
          authorKind: 'driver',
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
        const body = await parseBody(SEND_BODY_SCHEMA, request)
        assertWhatsAppBodyFits(body)
        return {
          contactIds: body.contactIds ?? [],
          correlationId,
          idempotencyKey: parseIdempotencyKey(body.idempotencyKey),
          ...(body.number === undefined ? {} : { number: body.number }),
          occurrenceId,
          save: body.save ?? false,
        }
      },
      pathname: SEND_PATH,
      policy: REPORT_POLICY,
      rateLimit: SEND_RATE_LIMIT,
    }),
  ]
}
