/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 319 T5: as rotas da caixa de conversas do WhatsApp. Quem atende o painel (`occurrences.resolve`) lê e assume;
 * a empresa vem sempre do contexto, nunca do corpo. Nada aqui toca a conversa da ocorrência (RF8).
 */
import { defineRoute } from '../../http/router.service.js'
import {
  invalidRequest,
  parseOption,
  parseUuidPathIdentifier,
  readListQuery,
  readPaging,
} from '../../http/request-parsing.service.js'
import {
  API_WHATSAPP_INBOX_CHAT_MESSAGES_PATH,
  API_WHATSAPP_INBOX_CHAT_READ_PATH,
  API_WHATSAPP_INBOX_CHAT_RELEASE_PATH,
  API_WHATSAPP_INBOX_CHAT_TAKE_OVER_PATH,
  API_WHATSAPP_INBOX_CHATS_PATH,
  JSON_CONTENT_TYPE,
} from '../../shared/api.constant.js'
import type {
  WhatsAppChat,
  WhatsAppChatListFilter,
  WhatsAppChatMessage,
  WhatsAppChatPage,
} from '../application/whatsapp-chat.port.js'
import type { WhatsAppInboxUseCase } from '../application/whatsapp-inbox.use-case.js'
import { WHATSAPP_CHAT_KINDS, WHATSAPP_CHAT_STATES } from '../domain/whatsapp-chat.constant.js'

const INBOX_POLICY = { permission: 'occurrences.resolve', scope: 'company' } as const
const LIST_QUERY_KEYS: ReadonlySet<string> = new Set(['cursor', 'kind', 'limit', 'state', 'unread'])
const PAGE_QUERY_KEYS: ReadonlySet<string> = new Set(['cursor', 'limit'])
const NO_QUERY_KEYS: ReadonlySet<string> = new Set()

export type WhatsAppInboxRoutesDependencies = {
  readonly inbox: WhatsAppInboxUseCase
}

type ChatId = { readonly chatId: string }
type Actor = { readonly correlationId: string }

export function createWhatsAppInboxRoutes(
  dependencies: WhatsAppInboxRoutesDependencies,
): readonly ReturnType<typeof defineRoute>[] {
  const { inbox } = dependencies

  return [
    defineRoute<Omit<WhatsAppChatListFilter, 'companyId'>>({
      async handle({ context, input }): Promise<Response> {
        const page = await inbox.list({ ...input, companyId: context.scope.companyId })
        return json(200, pageBody(page, serializeChat))
      },
      method: 'GET',
      parse: ({ request }) => {
        const query = readListQuery(new URL(request.url), LIST_QUERY_KEYS)
        const { cursor, limit } = readPaging(query)
        const kind = parseOption(query.get('kind'), WHATSAPP_CHAT_KINDS)
        const state = parseOption(query.get('state'), WHATSAPP_CHAT_STATES)
        const unread = query.get('unread')
        if (unread !== null && unread !== 'true') throw invalidRequest()
        return {
          cursor,
          limit,
          ...(kind === undefined ? {} : { kind }),
          ...(state === undefined ? {} : { state }),
          ...(unread === 'true' ? { unreadOnly: true } : {}),
        }
      },
      pathname: API_WHATSAPP_INBOX_CHATS_PATH,
      policy: INBOX_POLICY,
    }),
    defineRoute<ChatId & { readonly cursor: string | null; readonly limit: number }>({
      async handle({ context, input }): Promise<Response> {
        const page = await inbox.messages({ ...input, companyId: context.scope.companyId })
        return json(200, pageBody(page, serializeMessage))
      },
      method: 'GET',
      parse: ({ pathParameters, request }) => {
        const { cursor, limit } = readPaging(readListQuery(new URL(request.url), PAGE_QUERY_KEYS))
        return { chatId: parseUuidPathIdentifier(pathParameters.id ?? ''), cursor, limit }
      },
      pathname: API_WHATSAPP_INBOX_CHAT_MESSAGES_PATH,
      policy: INBOX_POLICY,
    }),
    defineRoute<ChatId & Actor>({
      async handle({ context, input }): Promise<Response> {
        const result = await inbox.takeOver({
          ...input,
          companyId: context.scope.companyId,
          userId: context.scope.userId,
        })
        return json(200, { data: serializeChat(result.chat), renewed: result.renewed })
      },
      method: 'POST',
      parse: ({ correlationId, pathParameters, request }) => {
        readListQuery(new URL(request.url), NO_QUERY_KEYS)
        return { chatId: parseUuidPathIdentifier(pathParameters.id ?? ''), correlationId }
      },
      pathname: API_WHATSAPP_INBOX_CHAT_TAKE_OVER_PATH,
      policy: INBOX_POLICY,
    }),
    defineRoute<ChatId & Actor>({
      async handle({ context, input }): Promise<Response> {
        const chat = await inbox.release({
          ...input,
          companyId: context.scope.companyId,
          userId: context.scope.userId,
        })
        return json(200, { data: serializeChat(chat) })
      },
      method: 'POST',
      parse: ({ correlationId, pathParameters, request }) => {
        readListQuery(new URL(request.url), NO_QUERY_KEYS)
        return { chatId: parseUuidPathIdentifier(pathParameters.id ?? ''), correlationId }
      },
      pathname: API_WHATSAPP_INBOX_CHAT_RELEASE_PATH,
      policy: INBOX_POLICY,
    }),
    defineRoute<ChatId>({
      async handle({ context, input }): Promise<Response> {
        const chat = await inbox.markRead({ ...input, companyId: context.scope.companyId })
        return json(200, { data: serializeChat(chat) })
      },
      method: 'POST',
      parse: ({ pathParameters, request }) => {
        readListQuery(new URL(request.url), NO_QUERY_KEYS)
        return { chatId: parseUuidPathIdentifier(pathParameters.id ?? '') }
      },
      pathname: API_WHATSAPP_INBOX_CHAT_READ_PATH,
      policy: INBOX_POLICY,
    }),
  ]
}

function pageBody<TItem, TOut>(
  page: WhatsAppChatPage<TItem>,
  serialize: (item: TItem) => TOut,
): { readonly data: readonly TOut[]; readonly nextCursor: string | null } {
  return { data: page.items.map(serialize), nextCursor: page.nextCursor }
}

/** O JID e o telefone não saem na lista: a tela endereça o chat pelo id interno (T7b). */
function serializeChat(chat: WhatsAppChat) {
  const unread =
    chat.lastInboundAt !== null && (chat.readAt === null || chat.readAt < chat.lastInboundAt)
  return {
    createdAt: chat.createdAt.toISOString(),
    expiresAt: chat.expiresAt?.toISOString() ?? null,
    id: chat.id,
    kind: chat.kind,
    lastInboundAt: chat.lastInboundAt?.toISOString() ?? null,
    lastMessageAt: chat.lastMessageAt?.toISOString() ?? null,
    releaseReason: chat.releaseReason,
    state: chat.state,
    takenOverAt: chat.takenOverAt?.toISOString() ?? null,
    takenOverByUserId: chat.takenOverByUserId,
    unread,
  }
}

function serializeMessage(message: WhatsAppChatMessage) {
  return {
    author: message.author,
    authorUserId: message.authorUserId,
    bodyText: message.bodyText,
    contentKind: message.contentKind,
    direction: message.direction,
    failureReason: message.failureReason,
    id: message.id,
    occurredAt: message.occurredAt.toISOString(),
    status: message.status,
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': JSON_CONTENT_TYPE },
    status,
  })
}
