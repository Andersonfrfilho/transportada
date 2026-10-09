/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  participantConversationPageSchema,
  participantMessageSchema,
  type ParticipantMessage,
  type ParticipantSubjectRef,
} from '@adatechnology/conversation-contracts'
import type { ParticipantConversationsApi } from '@adatechnology/conversations-ui/participant'

import { createBrowserRefreshEnvironment } from './conversationRefreshBrowser.service'
import {
  createConversationRefreshTicker,
  type ConversationRefreshTickerDependencies,
} from './conversationRefreshTicker.service'
import type { ConversationOutbox } from './conversationOutbox.service'
import {
  ATTACHMENT_URL_MAX_AGE_MS,
  CONVERSATION_REFRESH_INTERVAL_MS,
  CURRENT_TRIP_PATH,
  DRIVER_CONVERSATION_ERROR,
} from './driverConversation.constant'
import {
  createDriverConversationSender,
  type DriverConversationSender,
} from './driverConversationSender.service'
import { messagesPath } from './driverConversationSubject.service'
import {
  createClientMessageIdEcho,
  type ClientMessageIdEchoStorage,
} from './clientMessageIdEcho.service'
import {
  DriverConversationRequestError,
  type DriverConversationHttp,
} from './driverConversationsHttp.service'
import {
  isAwaitingParticipant,
  readAttachmentUrls,
  readDataArray,
  toConversationSummaryCandidate,
  toParticipantMessageCandidate,
} from './driverConversationsMapper.service'
import type { ConversationSnapshot } from './conversationSnapshot.service'
import { createDriverConversationUploader } from './driverConversationUploads.service'

export type DriverConversationsApiDependencies = Readonly<{
  echoStorage?: ClientMessageIdEchoStorage | undefined
  fallbackSubjectLabel: () => string
  http: DriverConversationHttp
  isOnline?: () => boolean
  now?: () => Date
  outbox: ConversationOutbox
  refreshEnvironment?: Partial<
    Pick<
      ConversationRefreshTickerDependencies,
      'bindTriggers' | 'intervalMs' | 'isOnline' | 'isVisible' | 'startTimer'
    >
  >
}>

/** O adapter do pacote mais o que o app liga por fora: a fila offline e seus gatilhos. */
export type DriverConversationsApi = ParticipantConversationsApi &
  Pick<DriverConversationSender, 'flushOutbox' | 'retryPending'> &
  Readonly<{ outbox: ConversationOutbox; requestRefresh: () => void }>

function readBrowserOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

type AttachmentUrlEntry = Readonly<{
  fetchedAt: number
  subject: ParticipantSubjectRef
  url: string
}>

/** Um adapter só por app: a identidade estável do `api` evita recarregar a lista a cada render. */
export function createDriverConversationsApi(
  dependencies: DriverConversationsApiDependencies,
): DriverConversationsApi {
  const { http, outbox } = dependencies
  const now = dependencies.now ?? (() => new Date())
  const echo = createClientMessageIdEcho(dependencies.echoStorage)
  const uploader = createDriverConversationUploader(http)
  const attachmentUrls = new Map<string, AttachmentUrlEntry>()
  /** A lista da API não traz a direção da última mensagem; vale a que a conversa aberta mostrou. */
  const awaitingByConversation = new Map<
    string,
    Readonly<{ lastMessageAt: string; isAwaiting: boolean }>
  >()

  async function fetchMessages(
    subject: ParticipantSubjectRef,
  ): Promise<readonly ParticipantMessage[]> {
    const payload = await http.getJson(messagesPath(subject))
    const rawMessages = readDataArray(payload)
    const messages = participantMessageSchema
      .array()
      .parse(rawMessages.map(toParticipantMessageCandidate))
    const fetchedAt = now().getTime()
    for (const raw of rawMessages) {
      for (const [id, url] of readAttachmentUrls(raw))
        attachmentUrls.set(id, { fetchedAt, subject, url })
    }
    const last = messages.at(-1)
    if (last !== undefined) {
      awaitingByConversation.set(subject.subjectId, {
        isAwaiting: isAwaitingParticipant(messages),
        lastMessageAt: last.createdAt,
      })
    }
    return echo.decorate(messages)
  }

  async function listConversations() {
    const payload = await http.getJson(`${CURRENT_TRIP_PATH}/occurrence-conversations`)
    const candidates = readDataArray(payload).map((raw) => {
      const { occurrenceId, lastMessageAt, unreadCount } = (raw ?? {}) as Record<string, unknown>
      const remembered = awaitingByConversation.get(String(occurrenceId))
      // temporário até a API trazer awaitingDriver (spec 260 T2.5)
      const isAwaiting =
        Number(unreadCount) > 0 ||
        (remembered !== undefined &&
          remembered.lastMessageAt === lastMessageAt &&
          remembered.isAwaiting)
      return toConversationSummaryCandidate({
        fallbackSubjectLabel: dependencies.fallbackSubjectLabel(),
        isAwaitingParticipant: isAwaiting,
        raw,
      })
    })
    return participantConversationPageSchema.parse({ data: candidates })
  }

  async function fetchSnapshot(): Promise<ConversationSnapshot> {
    const page = await listConversations()
    return page.data.map((conversation) => ({
      lastMessageAt: conversation.lastMessageAt,
      subject: {
        subjectId: conversation.subjectId,
        subjectType: conversation.subjectType,
      },
      unreadCount: conversation.unreadCount,
    }))
  }

  const refreshTicker = createConversationRefreshTicker({
    ...createBrowserRefreshEnvironment(),
    fetchSnapshot,
    intervalMs: CONVERSATION_REFRESH_INTERVAL_MS,
    ...dependencies.refreshEnvironment,
  })

  const sender = createDriverConversationSender({
    echo,
    http,
    isOnline: dependencies.isOnline ?? readBrowserOnline,
    now,
    outbox,
    uploader,
  })

  return {
    fetchMessages: (subject) => fetchMessages(subject),
    flushOutbox: sender.flushOutbox,
    listConversations,
    async markRead(subject) {
      await http.postJson(`${messagesPath(subject)}/read`)
    },
    async resolveAttachmentUrl(attachment) {
      const known = attachmentUrls.get(attachment.id)
      if (known !== undefined && now().getTime() - known.fetchedAt < ATTACHMENT_URL_MAX_AGE_MS) {
        return known.url
      }
      if (known !== undefined) await fetchMessages(known.subject)
      const refreshed = attachmentUrls.get(attachment.id)
      if (refreshed === undefined) {
        throw new DriverConversationRequestError(DRIVER_CONVERSATION_ERROR.REQUEST_FAILED)
      }
      return refreshed.url
    },
    outbox,
    requestRefresh: refreshTicker.requestRefresh,
    retryPending: sender.retryPending,
    sendMessage: sender.sendMessage,
    subscribe(listener) {
      const unsubscribeOutbox = outbox.subscribe((event) => {
        if (event.type !== 'message-settled') return
        listener({ subject: event.subject, type: 'conversation-changed' })
        listener({ type: 'inbox-changed' })
      })
      const unsubscribeRefresh = refreshTicker.subscribe(listener)
      return () => {
        unsubscribeOutbox()
        unsubscribeRefresh()
      }
    },
  }
}
