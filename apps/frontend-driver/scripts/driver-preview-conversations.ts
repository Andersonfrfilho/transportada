/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Rotas de conversa de ocorrência da API de demonstração do motorista (spec 260). **Só para
 * preview**: espelha `me-occurrence-conversation.routes.ts` da API real sobre um repositório em
 * memória. Importável sem efeito colateral — quem sobe o servidor é `driver-preview-api.ts`.
 *
 * Debug: `POST /__debug/conversations/reset`, `.../office-reply` {occurrenceId, text},
 * `.../fail-next` {count, status = 503}.
 */
import {
  OFFICE_REPLY_DELAY_MS,
  type ConversationRepository,
} from './driver-preview-conversations-repository'
import type { PreviewMessage } from './driver-preview-conversations-seed'

export type ConversationRoutesOptions = Readonly<{
  corsHeaders: Readonly<Record<string, string>>
  officeReplyDelayMs?: number
  port: number
  repository: ConversationRepository
}>

export type ConversationRoutes = (request: Request, url: URL) => Promise<Response | undefined>

const TRIP_PREFIX = /^(?:\/v1)?\/me\/trips\/current\//
const OCCURRENCE_ROUTE = /^occurrences\/([^/]+)\/(messages\/read|messages|uploads)$/
const STORAGE_ROUTE = /^\/__conversation-storage\/([^/]+)$/
const AUTO_REPLY_TEXT = 'Recebido, obrigado. Estamos verificando e já retornamos.'
const ONE_PIXEL_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (character) => character.charCodeAt(0),
)

function readRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

export function createConversationRoutes(options: ConversationRoutesOptions): ConversationRoutes {
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

  const notFound = (): Response =>
    json(
      { error: { code: 'OCCURRENCE_CONVERSATION_NOT_FOUND', message: 'Conversation not found.' } },
      404,
    )

  function toApiMessage(message: PreviewMessage): unknown {
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
    }
  }

  async function postMessage(request: Request, occurrenceId: string): Promise<Response> {
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
      occurrenceId,
    })
    if (result === undefined) return notFound()
    if (typeof result === 'number') {
      return json({ error: { code: 'SIMULATED_FAILURE', message: 'Simulated failure.' } }, result)
    }
    if (!result.isReplay && delayMs > 0) {
      setTimeout(
        () => repository.injectOfficeMessage({ occurrenceId, text: AUTO_REPLY_TEXT }),
        delayMs,
      )
    }
    return json(
      { data: { conversationId: occurrenceId, messageId: result.messageId } },
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

  async function handleOccurrence(request: Request, route: string): Promise<Response | undefined> {
    const match = OCCURRENCE_ROUTE.exec(route)
    if (match === null) return undefined
    const occurrenceId = decodeURIComponent(match[1] ?? '')
    const action = match[2]
    if (action === 'messages/read' && request.method === 'POST') {
      return repository.markRead(occurrenceId) ? empty(204) : notFound()
    }
    if (action === 'uploads' && request.method === 'POST') return requestUpload(request)
    if (action !== 'messages') return undefined
    if (request.method === 'POST') return postMessage(request, occurrenceId)
    const messages = repository.messages(occurrenceId)
    return messages === undefined ? notFound() : json({ data: messages.map(toApiMessage) })
  }

  async function handleDebug(request: Request, pathname: string): Promise<Response | undefined> {
    if (request.method !== 'POST') return undefined
    const body = readRecord(await request.json().catch(() => undefined))
    if (pathname === '/__debug/conversations/reset') {
      repository.reset()
      return json({ data: { reset: true } })
    }
    if (pathname === '/__debug/conversations/fail-next') {
      const count = typeof body.count === 'number' ? body.count : 1
      const status = typeof body.status === 'number' ? body.status : undefined
      repository.failNext({ count, ...(status === undefined ? {} : { status }) })
      return json({ data: { count, status: status ?? 503 } })
    }
    if (pathname === '/__debug/conversations/office-reply') {
      const messageId = repository.injectOfficeMessage({
        occurrenceId: typeof body.occurrenceId === 'string' ? body.occurrenceId : '',
        text: typeof body.text === 'string' ? body.text : AUTO_REPLY_TEXT,
      })
      return messageId === undefined ? notFound() : json({ data: { messageId } }, 201)
    }
    return undefined
  }

  function handleStorage(request: Request, pathname: string): Response | undefined {
    if (STORAGE_ROUTE.exec(pathname) === null) return undefined
    if (request.method === 'PUT') return empty(200)
    return new Response(ONE_PIXEL_PNG, {
      headers: { ...corsHeaders, 'content-type': 'image/png' },
      status: 200,
    })
  }

  return async function routeConversation(request, url) {
    const { pathname } = url
    if (pathname.startsWith('/__debug/conversations/')) return handleDebug(request, pathname)
    if (pathname.startsWith('/__conversation-storage/')) return handleStorage(request, pathname)
    const trip = TRIP_PREFIX.exec(pathname)
    if (trip === null) return undefined
    const route = pathname.slice(trip[0].length)
    if (route === 'occurrence-conversations' && request.method === 'GET') {
      return json({ data: repository.list() })
    }
    return handleOccurrence(request, route)
  }
}
