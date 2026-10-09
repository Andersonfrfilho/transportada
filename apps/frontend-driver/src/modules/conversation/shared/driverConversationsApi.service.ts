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
  DRIVER_CONVERSATION_ERROR,
} from './driverConversation.constant'
import {
  createDriverConversationSender,
  type DriverConversationSender,
} from './driverConversationSender.service'
import {
  createDriverConversationOpenAvailability,
  createDriverConversationOpener,
  type DriverConversationOpenAvailability,
} from './driverConversationOpen.service'
import { createDriverConversationRoutes } from './driverConversationRoutes.service'
import {
  DriverConversationRequestError,
  type DriverConversationHttp,
} from './driverConversationsHttp.service'
import {
  readAttachmentUrls,
  readDataArray,
  readNextCursor,
  readOfficeReadAtBySubject,
  toConversationSummaryCandidate,
  toLegacyConversationSummaryCandidate,
  toParticipantMessageCandidate,
} from './driverConversationsMapper.service'
import { conversationSubjectKey, type ConversationSnapshot } from './conversationSnapshot.service'
import { createDriverConversationUploader } from './driverConversationUploads.service'

export type DriverConversationsApiDependencies = Readonly<{
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
  Required<Pick<ParticipantConversationsApi, 'openConversation'>> &
  Pick<DriverConversationSender, 'flushOutbox' | 'retryPending'> &
  Readonly<{
    openAvailability: DriverConversationOpenAvailability
    outbox: ConversationOutbox
    requestRefresh: () => void
  }>

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
  const routes = createDriverConversationRoutes(http)
  const uploader = createDriverConversationUploader({ http, routes })
  const attachmentUrls = new Map<string, AttachmentUrlEntry>()
  const openAvailability = createDriverConversationOpenAvailability()
  const openConversation = createDriverConversationOpener({
    availability: openAvailability,
    fallbackSubjectLabel: dependencies.fallbackSubjectLabel,
    http,
  })

  async function fetchMessages(
    subject: ParticipantSubjectRef,
  ): Promise<readonly ParticipantMessage[]> {
    const payload = await routes.messages(subject)
    const rawMessages = readDataArray(payload)
    const messages = participantMessageSchema
      .array()
      .parse(rawMessages.map(toParticipantMessageCandidate))
    const fetchedAt = now().getTime()
    for (const raw of rawMessages) {
      for (const [id, url] of readAttachmentUrls(raw))
        attachmentUrls.set(id, { fetchedAt, subject, url })
    }
    return messages
  }

  async function loadConversationPage(cursor?: string) {
    const { isLegacy, payload } = await routes.list(cursor)
    const toCandidate = isLegacy
      ? toLegacyConversationSummaryCandidate
      : toConversationSummaryCandidate
    const fallbackSubjectLabel = dependencies.fallbackSubjectLabel()
    const nextCursor = isLegacy ? undefined : readNextCursor(payload)
    const page = participantConversationPageSchema.parse({
      data: readDataArray(payload).map((raw) => toCandidate({ fallbackSubjectLabel, raw })),
      ...(nextCursor === undefined ? {} : { nextCursor }),
    })
    return { page, payload }
  }

  async function listConversations(params?: Readonly<{ cursor?: string }>) {
    return (await loadConversationPage(params?.cursor)).page
  }

  async function fetchSnapshot(): Promise<ConversationSnapshot> {
    const { page, payload } = await loadConversationPage()
    const officeReadAtBySubject = readOfficeReadAtBySubject(payload)
    return page.data.map((conversation) => ({
      lastMessageAt: conversation.lastMessageAt,
      officeReadAt:
        officeReadAtBySubject.get(
          conversationSubjectKey({
            subjectId: conversation.subjectId,
            subjectType: conversation.subjectType,
          }),
        ) ?? null,
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
    isOnline: dependencies.isOnline ?? readBrowserOnline,
    now,
    outbox,
    routes,
    uploader,
  })

  return {
    fetchMessages: (subject) => fetchMessages(subject),
    flushOutbox: sender.flushOutbox,
    listConversations,
    markRead: (subject) => routes.markRead(subject),
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
    openAvailability,
    openConversation,
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
