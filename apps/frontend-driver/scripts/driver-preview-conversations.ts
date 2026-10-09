/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Rotas de conversa da API de demonstração do motorista (spec 260). **Só para preview**: espelha
 * `me-occurrence-conversation.routes.ts` (rota antiga, por ocorrência) e as rotas por assunto do
 * `api-contract.md` (`/me/trips/current/conversations/**`) sobre um repositório em memória.
 * Importável sem efeito colateral — quem sobe o servidor é `driver-preview-api.ts`.
 *
 * Debug: `POST /__debug/conversations/reset`, `.../office-reply` {subjectId, text},
 * `.../fail-next` {count, status = 503}.
 */
import {
  createConversationHandlers,
  readRecord,
  type ConversationHandlers,
  type ConversationHandlersOptions,
  type ConversationRouteShape,
} from './driver-preview-conversations-handlers'
import type { ConversationRepository } from './driver-preview-conversations-repository'
import type { PreviewSubjectType } from './driver-preview-conversations.types'

export type ConversationRoutesOptions = ConversationHandlersOptions

export type ConversationRoutes = (request: Request, url: URL) => Promise<Response | undefined>

type RouteTarget = Readonly<{
  action: string
  notFoundCode: string
  shape: ConversationRouteShape
  subjectId: string
  subjectType: PreviewSubjectType
}>

const TRIP_PREFIX = /^(?:\/v1)?\/me\/trips\/current\//
const OCCURRENCE_ROUTE = /^occurrences\/([^/]+)\/(messages\/read|messages|uploads)$/
const SUBJECT_ROUTE =
  /^conversations\/(occurrence|document|trip)\/([^/]+)\/(messages\/read|messages|uploads)$/
const STORAGE_ROUTE = /^\/__conversation-storage\/([^/]+)$/
const ONE_PIXEL_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  ),
  (character) => character.charCodeAt(0),
)

function matchTarget(route: string): RouteTarget | undefined {
  const legacy = OCCURRENCE_ROUTE.exec(route)
  if (legacy !== null) {
    return {
      action: legacy[2] ?? '',
      notFoundCode: 'OCCURRENCE_CONVERSATION_NOT_FOUND',
      shape: 'legacy',
      subjectId: decodeURIComponent(legacy[1] ?? ''),
      subjectType: 'occurrence',
    }
  }
  const subject = SUBJECT_ROUTE.exec(route)
  if (subject === null) return undefined
  return {
    action: subject[3] ?? '',
    notFoundCode: 'CONVERSATION_NOT_FOUND',
    shape: 'subject',
    subjectId: decodeURIComponent(subject[2] ?? ''),
    subjectType: subject[1] as PreviewSubjectType,
  }
}

async function handleTarget(
  input: Readonly<{
    handlers: ConversationHandlers
    repository: ConversationRepository
    request: Request
    target: RouteTarget
  }>,
): Promise<Response | undefined> {
  const { handlers, repository, request, target } = input
  const { subjectId, subjectType } = target
  if (!repository.has({ subjectId, subjectType })) return handlers.notFound(target.notFoundCode)
  if (target.action === 'messages/read' && request.method === 'POST') {
    repository.markRead(subjectId)
    return handlers.empty(204)
  }
  if (target.action === 'uploads' && request.method === 'POST') {
    return handlers.requestUpload(request)
  }
  if (target.action !== 'messages') return undefined
  if (request.method === 'POST') {
    return handlers.postMessage({ ...target, request })
  }
  const messages = repository.messages(subjectId) ?? []
  return handlers.json({
    data: messages.map((message) => handlers.toApiMessage(message, target.shape)),
  })
}

export function createConversationRoutes(options: ConversationRoutesOptions): ConversationRoutes {
  const { repository } = options
  const handlers = createConversationHandlers(options)

  async function handleDebug(request: Request, pathname: string): Promise<Response | undefined> {
    if (request.method !== 'POST') return undefined
    const body = readRecord(await request.json().catch(() => undefined))
    if (pathname === '/__debug/conversations/reset') {
      repository.reset()
      return handlers.json({ data: { reset: true } })
    }
    if (pathname === '/__debug/conversations/fail-next') {
      const count = typeof body.count === 'number' ? body.count : 1
      const status = typeof body.status === 'number' ? body.status : undefined
      repository.failNext({ count, ...(status === undefined ? {} : { status }) })
      return handlers.json({ data: { count, status: status ?? 503 } })
    }
    if (pathname === '/__debug/conversations/office-reply') {
      const subjectId = body.subjectId ?? body.occurrenceId
      const messageId = repository.injectOfficeMessage({
        subjectId: typeof subjectId === 'string' ? subjectId : '',
        text: typeof body.text === 'string' ? body.text : handlers.AUTO_REPLY_TEXT,
      })
      return messageId === undefined
        ? handlers.notFound('CONVERSATION_NOT_FOUND')
        : handlers.json({ data: { messageId } }, 201)
    }
    return undefined
  }

  function handleStorage(request: Request, pathname: string): Response | undefined {
    if (STORAGE_ROUTE.exec(pathname) === null) return undefined
    if (request.method === 'PUT') return handlers.empty(200)
    return new Response(ONE_PIXEL_PNG, {
      headers: { ...options.corsHeaders, 'content-type': 'image/png' },
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
      return handlers.json({ data: repository.list() })
    }
    if (route === 'conversations' && request.method === 'GET') {
      return handlers.json({ data: repository.listSummaries(), pagination: { nextCursor: null } })
    }
    const target = matchTarget(route)
    if (target === undefined) return undefined
    return handleTarget({ handlers, repository, request, target })
  }
}
