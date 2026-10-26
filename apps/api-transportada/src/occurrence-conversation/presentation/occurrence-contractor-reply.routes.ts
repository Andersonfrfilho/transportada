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
import { DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE } from '../../shared/delivery-client-email.constant.js'
import {
  CONTRACTOR_REPLY_EMAIL_TARGETS,
  CONTRACTOR_REPLY_HANDLED_NOTE_MAX_LENGTH,
} from '../../shared/occurrence-contractor-reply.constant.js'
import type {
  createMarkContractorReplyHandledUseCase,
  createReadContractorReplyUseCase,
} from '../application/contractor-reply-read.use-case.js'
import type { createDeliverContractorReplyToDriverUseCase } from '../application/deliver-contractor-reply-to-driver.use-case.js'
import type { ContractorReplyEmailReaderPort } from '../application/forward-contractor-reply-by-email.port.js'
import type {
  ForwardContractorReplyByEmailInput,
  ForwardContractorReplyByEmailUseCase,
  ForwardContractorReplyToClientInput,
} from '../application/forward-contractor-reply-by-email.use-case.js'
import type { createResendContractorReplyRequestUseCase } from '../application/resend-contractor-reply-request.use-case.js'
import { OCCURRENCE_CONVERSATION_RATE_LIMIT } from './occurrence-conversation.routes.js'

export const OCCURRENCE_CONTRACTOR_REPLY_DRIVER_DELIVERY_PATH =
  '/trip-occurrences/:id/contractor-reply/driver-delivery'
export const OCCURRENCE_CONTRACTOR_REPLY_EMAIL_DELIVERY_PATH =
  '/trip-occurrences/:id/contractor-reply/email-delivery'
/** Spec 279 T6b (RF12): "Tentar de novo" de uma entrega ao cliente que o provedor recusou. */
export const OCCURRENCE_CONTRACTOR_REPLY_EMAIL_RETRY_PATH =
  '/trip-occurrences/:id/contractor-reply/email-deliveries/:deliveryId/retry'
export const OCCURRENCE_CONTRACTOR_REPLY_EMAIL_OPTIONS_PATH =
  '/trip-occurrences/:id/contractor-reply/email-options'
export const OCCURRENCE_CONTRACTOR_REPLY_PATH = '/trip-occurrences/:id/contractor-reply'
export const OCCURRENCE_CONTRACTOR_REPLY_HANDLED_PATH =
  '/trip-occurrences/:id/contractor-reply/handled'
export const OCCURRENCE_CONTRACTOR_REPLY_RESEND_REQUEST_PATH =
  '/trip-occurrences/:id/contractor-reply/resend-request'

const CLIENT_TARGET = 'client_boleto_emails'

const READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const
const WRITE_POLICY = { permission: 'occurrences.resolve', scope: 'company' } as const

const BODY_SCHEMA = z.object({ attachmentId: z.string().uuid().optional() }).strict().readonly()

/** O teto do texto bruto só protege o parser: quem decide o endereço é a política do domínio (RF11). */
const EMAIL_BODY_SCHEMA = z
  .object({
    address: z.string().max(1000).optional(),
    attachmentId: z.string().uuid().optional(),
    /** Spec 279 T3 (RF4): só no alvo `client_boleto_emails` — os e-mails para boleto do cadastro do cliente. */
    emailIds: z
      .array(z.string().uuid())
      .min(1)
      .max(DELIVERY_CLIENT_EMAIL_MAX_PER_PURPOSE)
      .optional(),
    /** Spec 279 D4: guardar o endereço novo no cadastro do cliente; só com `address` e no alvo do cliente. */
    save: z.boolean().optional(),
    target: z.enum(CONTRACTOR_REPLY_EMAIL_TARGETS),
  })
  .strict()
  .readonly()

type EmailBody = z.infer<typeof EMAIL_BODY_SCHEMA>

/** As combinações que o corpo não expressa: cada alvo aceita só os campos que usa. */
function assertEmailBodyFits(body: EmailBody): void {
  if (body.target === 'note_recipient_email' && body.address !== undefined) {
    throw invalidRequest([
      { field: 'address', message: 'The note recipient address comes from the note' },
    ])
  }
  if (body.target !== CLIENT_TARGET) {
    if (body.emailIds !== undefined || body.save !== undefined) {
      throw invalidRequest([
        { field: 'target', message: 'emailIds and save are only for the client e-mails target' },
      ])
    }
    return
  }
  if (body.emailIds === undefined && body.address === undefined) {
    throw invalidRequest([{ field: 'emailIds', message: 'Choose a saved e-mail or enter one' }])
  }
  if (body.save === true && body.address === undefined) {
    throw invalidRequest([{ field: 'save', message: 'Only a new address can be saved' }])
  }
}

const HANDLED_BODY_SCHEMA = z
  .object({ note: z.string().trim().min(1).max(CONTRACTOR_REPLY_HANDLED_NOTE_MAX_LENGTH) })
  .strict()
  .readonly()

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': JSON_CONTENT_TYPE },
    status,
  })
}

export type OccurrenceContractorReplyRoutesDependencies = {
  readonly markHandled: Pick<
    ReturnType<typeof createMarkContractorReplyHandledUseCase>,
    'markHandled'
  >
  readonly readReply: Pick<ReturnType<typeof createReadContractorReplyUseCase>, 'read'>
  readonly resendRequest: Pick<
    ReturnType<typeof createResendContractorReplyRequestUseCase>,
    'resend'
  >
  readonly deliverToDriver: Pick<
    ReturnType<typeof createDeliverContractorReplyToDriverUseCase>,
    'deliver'
  >
  readonly emailOptions: ContractorReplyEmailReaderPort
  readonly forwardByEmail: Pick<
    ForwardContractorReplyByEmailUseCase,
    'forward' | 'forwardToClient' | 'retryToClient'
  >
}

type DriverDeliveryInput = {
  readonly attachmentId?: string
  readonly occurrenceId: string
}

type EmailDeliveryInput =
  | Omit<ForwardContractorReplyByEmailInput, 'actorUserId' | 'companyId'>
  | (Omit<ForwardContractorReplyToClientInput, 'actorUserId' | 'authorKind' | 'companyId'> & {
      readonly target: typeof CLIENT_TARGET
    })

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
    /**
     * Spec 248 T4.7 (RF10/RF11): o boleto ao cliente da nota ou a um e-mail informado. Spec 279 T3 (RF4): no alvo
     * `client_boleto_emails`, aos e-mails do cadastro do cliente e a um novo, com o resultado por endereço.
     */
    defineRoute<EmailDeliveryInput>({
      async handle({ context, input }): Promise<Response> {
        const actor = { actorUserId: context.scope.userId, companyId: context.scope.companyId }
        if (input.target === CLIENT_TARGET) {
          const outcome = await dependencies.forwardByEmail.forwardToClient({
            ...(input.address === undefined ? {} : { address: input.address }),
            ...(input.attachmentId === undefined ? {} : { attachmentId: input.attachmentId }),
            ...actor,
            authorKind: 'office',
            correlationId: input.correlationId,
            emailIds: input.emailIds,
            idempotencyKey: input.idempotencyKey,
            occurrenceId: input.occurrenceId,
            save: input.save,
          })
          const isQueued = outcome.results.some((result) => result.kind === 'queued')
          return jsonResponse({ data: outcome }, isQueued ? 201 : 200)
        }
        const outcome = await dependencies.forwardByEmail.forward({ ...input, ...actor })
        return jsonResponse({ data: outcome }, outcome.kind === 'queued' ? 201 : 200)
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const occurrenceId = parseUuidPathIdentifier(pathParameters.id ?? '')
        const idempotencyKey = parseIdempotencyKey(request.headers.get('idempotency-key'))
        const body = await parseBody(EMAIL_BODY_SCHEMA, request)
        assertEmailBodyFits(body)
        if (body.target === CLIENT_TARGET) {
          return {
            ...(body.address === undefined ? {} : { address: body.address }),
            ...(body.attachmentId === undefined ? {} : { attachmentId: body.attachmentId }),
            correlationId,
            emailIds: body.emailIds ?? [],
            idempotencyKey,
            occurrenceId,
            save: body.save ?? false,
            target: CLIENT_TARGET,
          }
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
    /**
     * Spec 279 T6b (RF12): o endereço e o anexo vêm da entrega recusada, nunca do corpo. A tentativa nova ganha chave
     * própria; o clique repetido encontra a que já está na fila. Sem `Idempotency-Key`: a entrega é a identidade.
     */
    defineRoute<{
      readonly correlationId: string
      readonly deliveryId: string
      readonly occurrenceId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const outcome = await dependencies.forwardByEmail.retryToClient({
          actorUserId: context.scope.userId,
          authorKind: 'office',
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          deliveryId: input.deliveryId,
          occurrenceId: input.occurrenceId,
        })
        const isQueued = outcome.results.some((result) => result.kind === 'queued')
        return jsonResponse({ data: outcome }, isQueued ? 201 : 200)
      },
      method: 'POST',
      parse: ({ correlationId, pathParameters }) => ({
        correlationId,
        deliveryId: parseUuidPathIdentifier(pathParameters.deliveryId ?? ''),
        occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: OCCURRENCE_CONTRACTOR_REPLY_EMAIL_RETRY_PATH,
      policy: WRITE_POLICY,
      rateLimit: OCCURRENCE_CONVERSATION_RATE_LIMIT,
    }),
    defineRoute<{ readonly occurrenceId: string }>({
      async handle({ context, input }): Promise<Response> {
        const options = await dependencies.emailOptions.read({
          companyId: context.scope.companyId,
          occurrenceId: input.occurrenceId,
        })
        return jsonResponse({ data: options })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: OCCURRENCE_CONTRACTOR_REPLY_EMAIL_OPTIONS_PATH,
      policy: WRITE_POLICY,
    }),
    defineRoute<{ readonly occurrenceId: string }>({
      async handle({ context, input }): Promise<Response> {
        const data = await dependencies.readReply.read({
          companyId: context.scope.companyId,
          occurrenceId: input.occurrenceId,
        })
        return jsonResponse({ data })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: OCCURRENCE_CONTRACTOR_REPLY_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<{
      readonly correlationId: string
      readonly idempotencyKey: string
      readonly occurrenceId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.resendRequest.resend({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          correlationId: input.correlationId,
          idempotencyKey: input.idempotencyKey,
          occurrenceId: input.occurrenceId,
        })
        return jsonResponse({ data: result }, 202)
      },
      method: 'POST',
      parse: ({ correlationId, pathParameters, request }) => ({
        correlationId,
        idempotencyKey: parseIdempotencyKey(request.headers.get('idempotency-key')),
        occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: OCCURRENCE_CONTRACTOR_REPLY_RESEND_REQUEST_PATH,
      policy: WRITE_POLICY,
      rateLimit: OCCURRENCE_CONVERSATION_RATE_LIMIT,
    }),
    defineRoute<{ readonly note: string; readonly occurrenceId: string }>({
      async handle({ context, input }): Promise<Response> {
        const outcome = await dependencies.markHandled.markHandled({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          note: input.note,
          occurrenceId: input.occurrenceId,
        })
        return jsonResponse({ data: outcome }, outcome.kind === 'handled' ? 201 : 200)
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseBody(HANDLED_BODY_SCHEMA, request)
        return {
          note: body.note,
          occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
        }
      },
      pathname: OCCURRENCE_CONTRACTOR_REPLY_HANDLED_PATH,
      policy: WRITE_POLICY,
      rateLimit: OCCURRENCE_CONVERSATION_RATE_LIMIT,
    }),
  ]
}
