/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 279 T4 (RF2/RF3): os e-mails do cliente para o boleto no `/me` do motorista. Ler é `trip.read` e enviar é
 * `trip.report`; o motorista é a ficha do vínculo do contexto e só a ocorrência da viagem dele é alcançada.
 * O motorista escolhe os já guardados por `emailId`, nunca por endereço; o endereço novo só entra no corpo do `POST`
 * e toda resposta leva a forma mascarada. Toda resposta é `no-store`.
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
import { DriverNotRegisteredError } from '../../trips/domain/trip.error.js'
import type { DriverClientBoletoEmailsUseCase } from '../application/driver-client-boleto-emails.use-case.js'

const READ_POLICY = { permission: 'trip.read', scope: 'company' } as const
const REPORT_POLICY = { permission: 'trip.report', scope: 'company' } as const
const EMAILS_PATH = '/me/trips/current/occurrences/:id/client-boleto-emails'
const SEND_PATH = `${EMAILS_PATH}/send`

/** Cada envio pode escrever no trilho de e-mail: balde próprio, como o da resposta do motorista. */
export const DRIVER_CLIENT_BOLETO_EMAIL_SEND_RATE_LIMIT = {
  maxRequests: 30,
  scope: 'driver-client-boleto-email-send',
  store: 'postgres',
  windowSeconds: 300,
} as const

/** O teto do texto bruto só protege o parser: quem decide o endereço é a política do domínio (D4). */
const SEND_BODY_SCHEMA = z
  .object({
    emailIds: z.array(z.string().uuid()).max(DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE).optional(),
    idempotencyKey: z.string().max(200),
    newAddress: z.string().max(1000).optional(),
    save: z.boolean().optional(),
  })
  .strict()
  .readonly()

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status,
  })
}

export function createMeClientBoletoEmailsRoutes(dependencies: {
  readonly clientBoletoEmails: DriverClientBoletoEmailsUseCase
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
        const data = await dependencies.clientBoletoEmails.list({
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
      pathname: EMAILS_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<{
      readonly correlationId: string
      readonly emailIds: readonly string[]
      readonly idempotencyKey: string
      readonly newAddress?: string
      readonly occurrenceId: string
      readonly save: boolean
    }>({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        const outcome = await dependencies.clientBoletoEmails.send({
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          driverId,
          driverUserId: context.scope.userId,
          emailIds: input.emailIds,
          idempotencyKey: input.idempotencyKey,
          ...(input.newAddress === undefined ? {} : { newAddress: input.newAddress }),
          occurrenceId: input.occurrenceId,
          save: input.save,
        })
        const isQueued = outcome.results.some((result) => result.kind === 'queued')
        return jsonResponse({ data: outcome }, isQueued ? 201 : 200)
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const occurrenceId = parseUuidPathIdentifier(pathParameters.id ?? '')
        const body = await parseBody(SEND_BODY_SCHEMA, request)
        const emailIds = body.emailIds ?? []
        if (emailIds.length === 0 && body.newAddress === undefined) {
          throw invalidRequest([
            { field: 'emailIds', message: 'Choose a saved e-mail or enter one' },
          ])
        }
        if (body.save === true && body.newAddress === undefined) {
          throw invalidRequest([{ field: 'save', message: 'Only a new address can be saved' }])
        }
        return {
          correlationId,
          emailIds,
          idempotencyKey: parseIdempotencyKey(body.idempotencyKey),
          ...(body.newAddress === undefined ? {} : { newAddress: body.newAddress }),
          occurrenceId,
          save: body.save ?? false,
        }
      },
      pathname: SEND_PATH,
      policy: REPORT_POLICY,
      rateLimit: DRIVER_CLIENT_BOLETO_EMAIL_SEND_RATE_LIMIT,
    }),
  ]
}
