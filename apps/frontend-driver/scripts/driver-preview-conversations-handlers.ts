/* Copyright (c) 2026 Ada Technology. MIT License. */
/** Respostas compartilhadas pelas rotas antiga (ocorrência) e nova (por assunto) da demonstração. */
import {
  OFFICE_REPLY_DELAY_MS,
  type ConversationRepository,
} from './driver-preview-conversations-repository'
import type { PreviewMessage } from './driver-preview-conversations.types'

export type ConversationHandlersOptions = Readonly<{
  corsHeaders: Readonly<Record<string, string>>
  officeReplyDelayMs?: number
  port: number
  repository: ConversationRepository
}>

/** `legacy` devolve `{ conversationId, messageId }` no envio; `subject` devolve a mensagem inteira, com o eco. */
export type ConversationRouteShape = 'legacy' | 'subject'

const AUTO_REPLY_TEXT = 'Recebido, obrigado. Estamos verificando e já retornamos.'

export function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

export function createConversationHandlers(options: ConversationHandlersOptions) {
  const { corsHeaders, repository } = options
  const delayMs = options.officeReplyDelayMs ?? OFFICE_REPLY_DELAY_MS
  const storageOrigin = `http://localhost:${options.port}`

  function json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'content-type': 'application/json' },
      status,
    })
  }

  const empty = (status: number): Response => new Response(null, { headers: corsHeaders, status })

  const notFound = (code: string): Response =>
    json({ error: { code, message: 'Conversation not found.' } }, 404)

  function toApiMessage(message: PreviewMessage, shape: ConversationRouteShape): unknown {
    return {
      attachments: message.attachments.map((attachment) => ({
        ...attachment,
        url: `${storageOrigin}/__conversation-storage/${attachment.id}`,
      })),
      authorName: message.authorName,
      bodyText: message.bodyText,
      createdAt: message.createdAt,
      direction: message.direction,
      id: message.id,
      status: message.status,
      ...(shape === 'subject'
        ? { channel: 'app', clientMessageId: message.clientMessageId ?? null }
        : {}),
    }
  }

  function toSendBody(
    input: Readonly<{ messageId: string; shape: ConversationRouteShape; subjectId: string }>,
  ) {
    if (input.shape === 'legacy') {
      return { conversationId: input.subjectId, messageId: input.messageId }
    }
    const message = repository
      .messages(input.subjectId)
      ?.find((item) => item.id === input.messageId)
    return message === undefined ? { id: input.messageId } : toApiMessage(message, 'subject')
  }

  async function postMessage(
    input: Readonly<{
      notFoundCode: string
      request: Request
      shape: ConversationRouteShape
      subjectId: string
    }>,
  ): Promise<Response> {
    const { request, subjectId } = input
    const idempotencyKey = request.headers.get('idempotency-key') ?? ''
    if (idempotencyKey === '') {
      return json({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Missing key.' } }, 400)
    }
    const body = readRecord(await request.json().catch(() => undefined))
    const attachmentIds = Array.isArray(body.attachmentIds)
      ? body.attachmentIds.filter((id): id is string => typeof id === 'string')
      : []
    const result = repository.send({
      attachmentIds,
      body: typeof body.body === 'string' ? body.body : '',
      idempotencyKey,
      subjectId,
    })
    if (result === undefined) return notFound(input.notFoundCode)
    if (typeof result === 'number') {
      return json({ error: { code: 'SIMULATED_FAILURE', message: 'Simulated failure.' } }, result)
    }
    if (!result.isReplay && delayMs > 0) {
      setTimeout(
        () => repository.injectOfficeMessage({ subjectId, text: AUTO_REPLY_TEXT }),
        delayMs,
      )
    }
    return json(
      { data: toSendBody({ messageId: result.messageId, shape: input.shape, subjectId }) },
      result.isReplay ? 200 : 201,
    )
  }

  async function requestUpload(request: Request): Promise<Response> {
    const body = readRecord(await request.json().catch(() => undefined))
    const uploadId = repository.registerUpload({
      contentType:
        typeof body.contentType === 'string' ? body.contentType : 'application/octet-stream',
      fileName: typeof body.fileName === 'string' ? body.fileName : 'arquivo',
      sizeBytes: typeof body.sizeBytes === 'number' ? body.sizeBytes : 0,
    })
    return json(
      { data: { uploadId, uploadUrl: `${storageOrigin}/__conversation-storage/${uploadId}` } },
      201,
    )
  }

  const OPEN_BODY_KEYS = ['subjectId', 'subjectType']

  /** `POST .../conversations/open`: só nota e viagem, corpo estrito; 201 ao criar, 200 se já existia. */
  async function openConversation(request: Request): Promise<Response> {
    const body = readRecord(await request.json().catch(() => undefined))
    const { subjectId, subjectType } = body
    const hasOnlyOpenKeys = Object.keys(body).every((key) => OPEN_BODY_KEYS.includes(key))
    if (
      !hasOnlyOpenKeys ||
      typeof subjectId !== 'string' ||
      (subjectType !== 'document' && subjectType !== 'trip')
    ) {
      return json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid body.' } }, 400)
    }
    const opened = repository.open({ subjectId, subjectType })
    if (opened === undefined) return notFound('CONVERSATION_NOT_FOUND')
    return json({ data: opened.summary }, opened.isNew ? 201 : 200)
  }

  return {
    AUTO_REPLY_TEXT,
    empty,
    json,
    notFound,
    openConversation,
    postMessage,
    requestUpload,
    toApiMessage,
  }
}

export type ConversationHandlers = ReturnType<typeof createConversationHandlers>
