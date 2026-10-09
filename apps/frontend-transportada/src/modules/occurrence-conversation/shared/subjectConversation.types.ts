/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 260 T3.1/T3.2 (ADR-0101 D2): a conversa de nota e de viagem como o escritório a lê
 * (`GET /trips/:tripId/conversations`, api-contract "Rotas do escritório"). O assunto é o par
 * `subjectType`/`subjectId`; `occurrence` não abre nem fecha por estas rotas e não entra aqui.
 */
import type { OccurrenceConversationChannel } from './occurrenceConversation.types'

export const SUBJECT_CONVERSATION_SUBJECT_TYPES = ['document', 'trip'] as const
export type SubjectConversationType = (typeof SUBJECT_CONVERSATION_SUBJECT_TYPES)[number]

export type SubjectConversationRef = Readonly<{
  subjectId: string
  subjectType: SubjectConversationType
  tripId: string
}>

export type SubjectConversationSummary = Readonly<{
  awaitingDriver: boolean
  channels: readonly OccurrenceConversationChannel[]
  /** O nome curto do destinatário que a API devolve; `null` quando a viagem não o tem. */
  driverName: null | string
  lastMessageAt: null | string
  lastMessagePreview?: string
  protocol: string
  status: 'closed' | 'open'
  subjectId: string
  subjectLabel: string
  subjectType: SubjectConversationType
  tripId: null | string
  /** Do ponto de vista do escritório: o que o motorista mandou depois da última leitura do usuário. */
  unreadCount: number
}>
