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
  createListMyConversationsUseCase,
  createListMyOccurrenceConversationUseCase,
  createMarkMyConversationReadUseCase,
  createReplyMyOccurrenceConversationUseCase,
  createRequestMyConversationUploadUseCase,
} from '../application/driver-conversation.use-case.js'
import { OCCURRENCE_MAIL_LIMITS } from '../domain/occurrence-conversation.constant.js'
import {
  conversationAttachmentIdsSchema,
  conversationUploadSchema,
} from './conversation-attachment.schema.js'

const READ_POLICY = { permission: 'trip.read', scope: 'company' } as const
const REPORT_POLICY = { permission: 'trip.report', scope: 'company' } as const
const MESSAGES_PATH = '/me/trips/current/occurrences/:id/messages'
const READ_PATH = `${MESSAGES_PATH}/read`
const INBOX_PATH = '/me/trips/current/occurrence-conversations'
const UPLOADS_PATH = '/me/trips/current/occurrences/:id/uploads'

/** Spec 183 T702a: o pedido de upload do motorista, num balde próprio. */
export const DRIVER_CONVERSATION_UPLOAD_RATE_LIMIT = {
  maxRequests: 60,
  scope: 'driver-occurrence-conversation-upload',
  store: 'postgres',
  windowSeconds: 300,
} as const

/**
 * Spec 183 T903 (achado S3): a resposta do motorista tem o próprio balde — cada envio pode ler até
 * 5 × 25 MB do bucket dentro da transação, e sem teto um app em loop esgotaria o pool.
 */
export const DRIVER_CONVERSATION_SEND_RATE_LIMIT = {
  maxRequests: 30,
  scope: 'driver-occurrence-conversation-send',
  store: 'postgres',
  windowSeconds: 300,
} as const

const replySchema = z
  .object({
    attachmentIds: conversationAttachmentIdsSchema,
    body: z.string().max(OCCURRENCE_MAIL_LIMITS.body),
  })
  .strict()

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
    status,
  })
}

export function createMeOccurrenceConversationRoutes(dependencies: {
  /** Spec 183 T604: as conversas do motorista para a lista do app (baixar é entregar). */
  readonly inbox: Pick<ReturnType<typeof createListMyConversationsUseCase>, 'list'>
  /** Spec 183 T604: abrir a conversa é ler as mensagens da operação. */
  readonly markRead: Pick<ReturnType<typeof createMarkMyConversationReadUseCase>, 'markRead'>
  readonly list: Pick<ReturnType<typeof createListMyOccurrenceConversationUseCase>, 'list'>
  readonly reply: Pick<ReturnType<typeof createReplyMyOccurrenceConversationUseCase>, 'reply'>
  /** Spec 183 T702a: a URL de subida da foto ou do documento, só para a conversa dele. */
  readonly requestUpload: Pick<
    ReturnType<typeof createRequestMyConversationUploadUseCase>,
    'request'
  >
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
    defineRoute<Record<string, never>>({
      async handle({ context }): Promise<Response> {
        await resolveDriver(context.scope)
        const data = await dependencies.inbox.list({
          companyId: context.scope.companyId,
          driverUserId: context.scope.userId,
        })
        return jsonResponse({ data })
      },
      method: 'GET',
      parse: () => ({}),
      pathname: INBOX_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<{ readonly occurrenceId: string }>({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        await dependencies.markRead.markRead({
          companyId: context.scope.companyId,
          driverId,
          driverUserId: context.scope.userId,
          occurrenceId: input.occurrenceId,
        })
        return new Response(null, { headers: { 'cache-control': 'no-store' }, status: 204 })
      },
      method: 'POST',
      parse: ({ pathParameters }) => ({
        occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: READ_PATH,
      policy: READ_POLICY,
    }),
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
      readonly contentType: string
      readonly fileName: string
      readonly occurrenceId: string
      readonly sizeBytes: number
    }>({
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
        const occurrenceId = parseUuidPathIdentifier(pathParameters.id ?? '')
        const body = await parseBody(conversationUploadSchema, request)
        return { ...body, occurrenceId }
      },
      pathname: UPLOADS_PATH,
      policy: REPORT_POLICY,
      rateLimit: DRIVER_CONVERSATION_UPLOAD_RATE_LIMIT,
    }),
    defineRoute<{
      readonly attachmentIds: readonly string[]
      readonly bodyText: string
      readonly idempotencyKey: string
      readonly occurrenceId: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const driverId = await resolveDriver(context.scope)
        const data = await dependencies.reply.reply({
          attachmentIds: input.attachmentIds,
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
        return {
          attachmentIds: body.attachmentIds ?? [],
          bodyText: body.body,
          idempotencyKey,
          occurrenceId,
        }
      },
      pathname: MESSAGES_PATH,
      policy: REPORT_POLICY,
      rateLimit: DRIVER_CONVERSATION_SEND_RATE_LIMIT,
    }),
  ]
}
