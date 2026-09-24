/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 183 T404 (RF6, RF7, RF15): as rotas da conversa da ocorrência.
 *
 * - Ler as conversas e marcar como lida é da listagem (`fleet.read`), como o detalhe.
 * - Escrever à contratante e ver a prévia é de quem conduz a tratativa (`occurrences.resolve`,
 *   `company-admin`/`operator`/`finance`). ⚠️ O plano dizia `trip.manage`, mas o separador tem
 *   `trip.manage` e a 143 T016 manda que ele **não** alcance o envio — a única permissão que cumpre
 *   as duas coisas é a da tratativa.
 * - A rota que dispara e-mail conta no Postgres (`docs/SECURITY.md` M1), num balde próprio: a
 *   conversa manda mais que o e-mail de correção, e dividir o balde travaria um pelo outro.
 * - Toda resposta é `no-store` (endereços e corpo de mensagem), e nenhum log leva assunto, corpo ou
 *   destinatário: o erro sai pelo código.
 */
import { z } from 'zod'

import { parseIdempotencyKey } from '../../cte-batches/presentation/cte-batch.schema.js'
import {
  invalidRequest,
  parseBody,
  parseUuidPathIdentifier,
} from '../../http/request-parsing.service.js'
import { defineRoute } from '../../http/router.service.js'
import {
  OCCURRENCE_CONVERSATION_CHANNELS,
  OCCURRENCE_CONVERSATION_PARTICIPANTS,
  type OccurrenceConversationParticipant,
} from '../../database/occurrence-conversation.schema.js'
import type { PreviewOccurrenceMailUseCase } from '../application/preview-occurrence-mail.use-case.js'
import type {
  ListOccurrenceConversationsUseCase,
  MarkOccurrenceConversationReadUseCase,
} from '../application/read-occurrence-conversations.use-case.js'
import type { SendOccurrenceMailUseCase } from '../application/send-occurrence-mail.use-case.js'
import { OCCURRENCE_MAIL_LIMITS } from '../domain/occurrence-conversation.constant.js'
import { OccurrenceConversationChannelUnavailableError } from '../domain/occurrence-conversation.error.js'

const READ_POLICY = { permission: 'fleet.read', scope: 'company' } as const
const WRITE_POLICY = { permission: 'occurrences.resolve', scope: 'company' } as const

export const OCCURRENCE_CONVERSATION_RATE_LIMIT = {
  maxRequests: 30,
  scope: 'occurrence-conversation',
  store: 'postgres',
  windowSeconds: 300,
} as const

const CONVERSATIONS_PATH = '/trip-occurrences/:id/conversations'
const MESSAGES_PATH = '/trip-occurrences/:id/conversations/:participant/messages'
const MAIL_PREVIEW_PATH = '/trip-occurrences/:id/conversations/contractor/mail-preview'
const READ_PATH = '/occurrence-conversations/:id/read'
/** O teto de destinatários do worker da 143 (`to_addresses`, até 50). */
const MAX_RECIPIENTS = 50

const sendMessageSchema = z
  .object({
    body: z.string().max(OCCURRENCE_MAIL_LIMITS.body),
    channel: z.enum(OCCURRENCE_CONVERSATION_CHANNELS),
    contactIds: z.array(z.string().uuid()).min(1).max(MAX_RECIPIENTS),
    subject: z.string().max(OCCURRENCE_MAIL_LIMITS.subject),
  })
  .strict()

const mailPreviewSchema = z
  .object({
    body: z.string().max(OCCURRENCE_MAIL_LIMITS.body).optional(),
    subject: z.string().max(OCCURRENCE_MAIL_LIMITS.subject).optional(),
  })
  .strict()

export type OccurrenceConversationRoutesDependencies = {
  readonly listConversations: ListOccurrenceConversationsUseCase
  readonly markRead: MarkOccurrenceConversationReadUseCase
  readonly previewMail: PreviewOccurrenceMailUseCase
  readonly sendMail: SendOccurrenceMailUseCase
}

function jsonResponse(body: object, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'cache-control': 'no-store', 'content-type': 'application/json' },
    status,
  })
}

function parseParticipant(value: string | undefined): OccurrenceConversationParticipant {
  const participant = OCCURRENCE_CONVERSATION_PARTICIPANTS.find((candidate) => candidate === value)
  if (participant === undefined) throw invalidRequest()
  return participant
}

type SendInput = {
  readonly bodyText: string
  readonly contactIds: readonly string[]
  readonly correlationId: string
  readonly idempotencyKey: string
  readonly occurrenceId: string
  readonly subject: string
}

export function createOccurrenceConversationRoutes(
  dependencies: OccurrenceConversationRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  return [
    defineRoute<{ readonly occurrenceId: string }>({
      async handle({ context, input }): Promise<Response> {
        const view = await dependencies.listConversations.list({
          companyId: context.scope.companyId,
          occurrenceId: input.occurrenceId,
          userId: context.scope.userId,
        })
        return jsonResponse({ data: view })
      },
      method: 'GET',
      parse: ({ pathParameters }) => ({
        occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: CONVERSATIONS_PATH,
      policy: READ_POLICY,
    }),
    defineRoute<SendInput>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.sendMail.send({
          actorUserId: context.scope.userId,
          bodyText: input.bodyText,
          companyId: context.scope.companyId,
          contactIds: input.contactIds,
          correlationId: input.correlationId,
          idempotencyKey: input.idempotencyKey,
          occurrenceId: input.occurrenceId,
          subject: input.subject,
        })
        return jsonResponse({ data: result }, 202)
      },
      method: 'POST',
      async parse({ correlationId, pathParameters, request }) {
        const occurrenceId = parseUuidPathIdentifier(pathParameters.id ?? '')
        const participant = parseParticipant(pathParameters.participant)
        const idempotencyKey = parseIdempotencyKey(request.headers.get('idempotency-key'))
        const body = await parseBody(sendMessageSchema, request)
        /** Hoje só a contratante por e-mail envia; WhatsApp, app e portal chegam nas Fases 5–6b. */
        if (participant !== 'contractor' || body.channel !== 'email') {
          throw new OccurrenceConversationChannelUnavailableError()
        }
        return {
          bodyText: body.body,
          contactIds: body.contactIds,
          correlationId,
          idempotencyKey,
          occurrenceId,
          subject: body.subject,
        }
      },
      /** `:participant` é `contractor`/`driver`, não UUID; o `:id` é conferido como UUID no `parse`. */
      pathParameterFormat: 'raw',
      pathname: MESSAGES_PATH,
      policy: WRITE_POLICY,
      rateLimit: OCCURRENCE_CONVERSATION_RATE_LIMIT,
    }),
    defineRoute<{
      readonly bodyText?: string
      readonly occurrenceId: string
      readonly subject?: string
    }>({
      async handle({ context, input }): Promise<Response> {
        const preview = await dependencies.previewMail.preview({
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
          occurrenceId: input.occurrenceId,
          ...(input.bodyText === undefined ? {} : { bodyText: input.bodyText }),
          ...(input.subject === undefined ? {} : { subject: input.subject }),
        })
        return jsonResponse({ data: preview })
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const body = await parseBody(mailPreviewSchema, request)
        return {
          occurrenceId: parseUuidPathIdentifier(pathParameters.id ?? ''),
          ...(body.body === undefined ? {} : { bodyText: body.body }),
          ...(body.subject === undefined ? {} : { subject: body.subject }),
        }
      },
      pathname: MAIL_PREVIEW_PATH,
      policy: WRITE_POLICY,
    }),
    defineRoute<{ readonly conversationId: string }>({
      async handle({ context, input }): Promise<Response> {
        const result = await dependencies.markRead.markRead({
          companyId: context.scope.companyId,
          conversationId: input.conversationId,
          userId: context.scope.userId,
        })
        return jsonResponse({ data: result })
      },
      method: 'POST',
      parse: ({ pathParameters }) => ({
        conversationId: parseUuidPathIdentifier(pathParameters.id ?? ''),
      }),
      pathname: READ_PATH,
      policy: READ_POLICY,
    }),
  ]
}
