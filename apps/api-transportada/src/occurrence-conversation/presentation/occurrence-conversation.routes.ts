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
import type { createSendContractorPortalMessageUseCase } from '../application/contractor-portal-message.use-case.js'
import type { createSendDriverAppMessageUseCase } from '../application/driver-conversation.use-case.js'
import type { createRequestOccurrenceConversationUploadUseCase } from '../application/occurrence-conversation-upload.use-case.js'
import type { SendOccurrenceMailUseCase } from '../application/send-occurrence-mail.use-case.js'
import { OCCURRENCE_MAIL_LIMITS } from '../domain/occurrence-conversation.constant.js'
import { OccurrenceConversationChannelUnavailableError } from '../domain/occurrence-conversation.error.js'
import {
  conversationAttachmentIdsSchema,
  conversationUploadFields,
} from './conversation-attachment.schema.js'

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
const UPLOADS_PATH = '/trip-occurrences/:id/conversations/:participant/uploads'

/**
 * Spec 183 T702a: o pedido de upload do operador, num balde próprio — cinco anexos por mensagem,
 * com folga para refazer um arquivo.
 */
export const OCCURRENCE_CONVERSATION_UPLOAD_RATE_LIMIT = {
  maxRequests: 60,
  scope: 'occurrence-conversation-upload',
  store: 'postgres',
  windowSeconds: 300,
} as const

const operatorUploadSchema = z
  .object({ ...conversationUploadFields, channel: z.enum(OCCURRENCE_CONVERSATION_CHANNELS) })
  .strict()
/** O teto de destinatários do worker da 143 (`to_addresses`, até 50). */
const MAX_RECIPIENTS = 50

/** O canal decide o corpo: lido primeiro, e o corpo do canal é conferido estrito depois. */
const channelSchema = z.object({ channel: z.enum(OCCURRENCE_CONVERSATION_CHANNELS) }).passthrough()

const mailMessageSchema = z
  .object({
    body: z.string().max(OCCURRENCE_MAIL_LIMITS.body),
    channel: z.literal('email'),
    contactIds: z.array(z.string().uuid()).min(1).max(MAX_RECIPIENTS),
    subject: z.string().max(OCCURRENCE_MAIL_LIMITS.subject),
  })
  .strict()

/** Spec 183 T601 (RF11): ao motorista pelo app — o texto e, desde a T702a, os anexos. */
const appMessageSchema = z
  .object({
    attachmentIds: conversationAttachmentIdsSchema,
    body: z.string().max(OCCURRENCE_MAIL_LIMITS.body),
    channel: z.literal('app'),
  })
  .strict()

/**
 * Spec 183 T654 (RF21): à contratante pelo portal — o texto e, desde a T702a, os anexos. Desde a
 * T702d, também os anexos da conversa do motorista encaminhados (`forwardAttachmentIds`); o teto
 * de cinco vale para a soma, conferida no caso de uso.
 */
const portalMessageSchema = z
  .object({
    attachmentIds: conversationAttachmentIdsSchema,
    body: z.string().max(OCCURRENCE_MAIL_LIMITS.body),
    channel: z.literal('portal'),
    forwardAttachmentIds: conversationAttachmentIdsSchema,
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
  /** Spec 183 T702a: a URL de subida de um anexo. */
  readonly requestUpload: Pick<
    ReturnType<typeof createRequestOccurrenceConversationUploadUseCase>,
    'request'
  >
  readonly sendMail: SendOccurrenceMailUseCase
  /** Spec 183 T601: ao motorista pelo app. */
  readonly sendDriverApp: Pick<ReturnType<typeof createSendDriverAppMessageUseCase>, 'send'>
  /** Spec 183 T654: à contratante pelo portal. */
  readonly sendPortal: Pick<ReturnType<typeof createSendContractorPortalMessageUseCase>, 'send'>
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

type SendInput =
  | {
      readonly bodyText: string
      readonly contactIds: readonly string[]
      readonly correlationId: string
      readonly idempotencyKey: string
      readonly kind: 'mail'
      readonly occurrenceId: string
      readonly subject: string
    }
  | {
      readonly attachmentIds: readonly string[]
      readonly bodyText: string
      readonly forwardAttachmentIds?: readonly string[]
      readonly idempotencyKey: string
      readonly kind: 'app' | 'portal'
      readonly occurrenceId: string
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
        if (input.kind !== 'mail') {
          const request = {
            actorUserId: context.scope.userId,
            attachmentIds: input.attachmentIds,
            bodyText: input.bodyText,
            companyId: context.scope.companyId,
            idempotencyKey: input.idempotencyKey,
            occurrenceId: input.occurrenceId,
          }
          const result =
            input.kind === 'app'
              ? await dependencies.sendDriverApp.send(request)
              : await dependencies.sendPortal.send({
                  ...request,
                  forwardAttachmentIds: input.forwardAttachmentIds ?? [],
                })
          return jsonResponse({ data: result }, 202)
        }
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
        const raw = await parseBody(channelSchema, request)
        /**
         * Hoje: a contratante por e-mail (T404) e pelo portal (T654), e o motorista pelo app
         * (T601). WhatsApp espera os modelos da Meta (T503).
         */
        if (participant === 'contractor' && raw.channel === 'email') {
          const body = mailMessageSchema.safeParse(raw)
          if (!body.success) throw invalidRequest()
          return {
            bodyText: body.data.body,
            contactIds: body.data.contactIds,
            correlationId,
            idempotencyKey,
            kind: 'mail' as const,
            occurrenceId,
            subject: body.data.subject,
          }
        }
        if (participant === 'contractor' && raw.channel === 'portal') {
          const body = portalMessageSchema.safeParse(raw)
          if (!body.success) throw invalidRequest()
          return {
            attachmentIds: body.data.attachmentIds ?? [],
            bodyText: body.data.body,
            forwardAttachmentIds: body.data.forwardAttachmentIds ?? [],
            idempotencyKey,
            kind: 'portal' as const,
            occurrenceId,
          }
        }
        if (participant === 'driver' && raw.channel === 'app') {
          const body = appMessageSchema.safeParse(raw)
          if (!body.success) throw invalidRequest()
          return {
            attachmentIds: body.data.attachmentIds ?? [],
            bodyText: body.data.body,
            idempotencyKey,
            kind: 'app' as const,
            occurrenceId,
          }
        }
        throw new OccurrenceConversationChannelUnavailableError()
      },
      /** `:participant` é `contractor`/`driver`, não UUID; o `:id` é conferido como UUID no `parse`. */
      pathParameterFormat: 'raw',
      pathname: MESSAGES_PATH,
      policy: WRITE_POLICY,
      rateLimit: OCCURRENCE_CONVERSATION_RATE_LIMIT,
    }),
    defineRoute<{
      readonly channel: (typeof OCCURRENCE_CONVERSATION_CHANNELS)[number]
      readonly contentType: string
      readonly fileName: string
      readonly occurrenceId: string
      readonly participant: OccurrenceConversationParticipant
      readonly sizeBytes: number
    }>({
      async handle({ context, input }): Promise<Response> {
        const data = await dependencies.requestUpload.request({
          ...input,
          actorUserId: context.scope.userId,
          companyId: context.scope.companyId,
        })
        return jsonResponse({ data }, 201)
      },
      method: 'POST',
      async parse({ pathParameters, request }) {
        const occurrenceId = parseUuidPathIdentifier(pathParameters.id ?? '')
        const participant = parseParticipant(pathParameters.participant)
        const body = await parseBody(operatorUploadSchema, request)
        return { ...body, occurrenceId, participant }
      },
      /** `:participant` é `contractor`/`driver`, não UUID; o `:id` é conferido como UUID no `parse`. */
      pathParameterFormat: 'raw',
      pathname: UPLOADS_PATH,
      policy: WRITE_POLICY,
      rateLimit: OCCURRENCE_CONVERSATION_UPLOAD_RATE_LIMIT,
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
