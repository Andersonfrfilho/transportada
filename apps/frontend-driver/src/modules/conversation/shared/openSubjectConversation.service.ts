/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  ParticipantConversationSummary,
  ParticipantSubjectRef,
} from '@adatechnology/conversation-contracts'

import {
  DRIVER_CONVERSATION_ERROR,
  type OPENABLE_SUBJECT_TYPES,
} from './driverConversation.constant'
import { DriverConversationRequestError } from './driverConversationsHttp.service'

export type OpenableSubject = Readonly<{
  subjectId: string
  subjectType: (typeof OPENABLE_SUBJECT_TYPES)[number]
}>

/** O que o botão sabe da conversa, vindo da lista leve que a aba já consulta. */
export type KnownConversation = Readonly<{
  status: ParticipantConversationSummary['status']
  unreadCount: number
}>

export type OpenActionInput = Readonly<{
  conversation: KnownConversation | undefined
  isOnline: boolean
  isOpening: boolean
  isUnavailable: boolean
}>

export type OpenAction = Readonly<{
  kind: 'hidden' | 'offline' | 'open' | 'opening' | 'view'
  /** Conversa já conhecida e sem rede: navega sem perguntar ao servidor. */
  shouldRequestServer: boolean
  unreadCount: number
}>

export type OpenErrorKey = 'closed' | 'failed' | 'notFound' | 'rateLimited'

export type OpenOutcome =
  | Readonly<{ status: 'opened' }>
  | Readonly<{ errorKey: OpenErrorKey; status: 'failed' }>
  | Readonly<{ status: 'unavailable' }>

/** Prioridade: API sem a rota esconde; depois "abrindo"; encerrada só se lê; sem rede só vale a conversa já conhecida. */
export function resolveOpenAction(input: OpenActionInput): OpenAction {
  const unreadCount = input.conversation?.unreadCount ?? 0
  if (input.isUnavailable) return { kind: 'hidden', shouldRequestServer: false, unreadCount }
  if (input.isOpening) return { kind: 'opening', shouldRequestServer: true, unreadCount }
  if (input.conversation?.status === 'closed') {
    return { kind: 'view', shouldRequestServer: false, unreadCount }
  }
  if (!input.isOnline && input.conversation === undefined) {
    return { kind: 'offline', shouldRequestServer: true, unreadCount }
  }
  return { kind: 'open', shouldRequestServer: input.isOnline, unreadCount }
}

export function resolveOpenErrorKey(error: unknown): OpenErrorKey {
  if (!(error instanceof DriverConversationRequestError)) return 'failed'
  if (error.status === 404) return 'notFound'
  if (error.status === 409) return 'closed'
  if (error.status === 429) return 'rateLimited'
  return 'failed'
}

export type RunOpenSubjectInput = Readonly<{
  navigate: (subject: ParticipantSubjectRef) => void
  openConversation: (subject: ParticipantSubjectRef) => Promise<ParticipantConversationSummary>
  shouldRequestServer: boolean
  subject: OpenableSubject
}>

/** O toque: abre no servidor (se preciso) e só então navega; falha vira chave de mensagem, sem navegar. */
export async function runOpenSubject(input: RunOpenSubjectInput): Promise<OpenOutcome> {
  const { subject } = input
  if (input.shouldRequestServer) {
    try {
      await input.openConversation(subject)
    } catch (error) {
      if (
        error instanceof DriverConversationRequestError &&
        error.code === DRIVER_CONVERSATION_ERROR.CONVERSATIONS_UNAVAILABLE
      ) {
        return { status: 'unavailable' }
      }
      return { errorKey: resolveOpenErrorKey(error), status: 'failed' }
    }
  }
  input.navigate(subject)
  return { status: 'opened' }
}
