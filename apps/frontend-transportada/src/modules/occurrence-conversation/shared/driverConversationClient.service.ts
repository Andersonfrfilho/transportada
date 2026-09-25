/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 183 T604 (RF11, RF14): o cliente do app do motorista para a conversa da ocorrência. Baixar a
 * lista e a conversa é o que o servidor registra como "entregue"; abrir chama a leitura; responder
 * leva a chave. A leitura é tolerante: item malformado sai da lista, sem derrubar a tela.
 */
import { isRecord, isString } from '@/modules/trip/shared/tripGuards.validation'

import { OCCURRENCE_CONVERSATION_MESSAGE_STATUSES } from './occurrenceConversation.types'
import { requestJson, type ClientDependencies } from './occurrenceConversationClient.service'

const CURRENT_TRIP_PATH = '/me/trips/current'

export type DriverConversationSummary = Readonly<{
  lastMessageAt: string
  occurrenceId: string
  occurrenceLabel: string
  unreadCount: number
}>

export type DriverConversationMessage = Readonly<{
  /** Quem escreveu da operação; `null` na mensagem do próprio motorista. */
  authorName: null | string
  bodyText: string
  createdAt: string
  direction: 'inbound' | 'outbound'
  id: string
  status: null | string
}>

export type DriverConversationClient = Readonly<{
  listConversations: () => Promise<readonly DriverConversationSummary[]>
  listMessages: (occurrenceId: string) => Promise<readonly DriverConversationMessage[]>
  markRead: (occurrenceId: string) => Promise<void>
  reply: (input: { body: string; idempotencyKey: string; occurrenceId: string }) => Promise<void>
}>

function isSummary(value: unknown): value is DriverConversationSummary {
  return (
    isRecord(value) &&
    isString(value.lastMessageAt) &&
    isString(value.occurrenceId) &&
    isString(value.occurrenceLabel) &&
    typeof value.unreadCount === 'number'
  )
}

function isMessage(value: unknown): value is DriverConversationMessage {
  return (
    isRecord(value) &&
    (value.authorName === null || isString(value.authorName)) &&
    isString(value.bodyText) &&
    isString(value.createdAt) &&
    (value.direction === 'inbound' || value.direction === 'outbound') &&
    isString(value.id) &&
    (value.status === null ||
      (OCCURRENCE_CONVERSATION_MESSAGE_STATUSES as readonly unknown[]).includes(value.status))
  )
}

function readList<TItem>(payload: unknown, guard: (value: unknown) => value is TItem): TItem[] {
  const data = isRecord(payload) ? payload.data : undefined
  return Array.isArray(data) ? data.filter(guard) : []
}

/** As mensagens da operação ainda não abertas, somadas: é o número do atalho na tela da viagem. */
export function countDriverUnread(conversations: readonly DriverConversationSummary[]): number {
  return conversations.reduce((total, conversation) => total + conversation.unreadCount, 0)
}

const messagesPath = (occurrenceId: string): string =>
  `${CURRENT_TRIP_PATH}/occurrences/${encodeURIComponent(occurrenceId)}/messages`

export function createDriverConversationClient(
  dependencies: ClientDependencies,
): DriverConversationClient {
  return {
    async listConversations() {
      const payload = await requestJson(
        dependencies,
        `${CURRENT_TRIP_PATH}/occurrence-conversations`,
      )
      return readList(payload, isSummary)
    },
    async listMessages(occurrenceId) {
      return readList(await requestJson(dependencies, messagesPath(occurrenceId)), isMessage)
    },
    async markRead(occurrenceId) {
      await requestJson(dependencies, `${messagesPath(occurrenceId)}/read`, { method: 'POST' })
    },
    async reply({ body, idempotencyKey, occurrenceId }) {
      await requestJson(dependencies, messagesPath(occurrenceId), {
        body: { body },
        headers: { 'idempotency-key': idempotencyKey },
        method: 'POST',
      })
    },
  }
}
