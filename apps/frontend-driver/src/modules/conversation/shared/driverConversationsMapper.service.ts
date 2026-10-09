/* Copyright (c) 2026 Ada Technology. MIT License. */
import type {
  ParticipantAttachment,
  ParticipantMessage,
} from '@adatechnology/conversation-contracts'

import {
  DRIVER_CONVERSATION_SUBJECT_TYPE,
  PARTICIPANT_MESSAGE_STATUSES,
} from './driverConversation.constant'

type RawRecord = Readonly<Record<string, unknown>>

function asRecord(value: unknown): RawRecord {
  return typeof value === 'object' && value !== null ? (value as RawRecord) : {}
}

/** Lista da API (`{ data: [...] }`); qualquer outra forma é lista vazia — o schema do pacote recusa o resto. */
export function readDataArray(payload: unknown): readonly unknown[] {
  const { data } = asRecord(payload)
  return Array.isArray(data) ? (data as readonly unknown[]) : []
}

export function attachmentKindOf(mimeType: string): ParticipantAttachment['kind'] {
  if (mimeType.startsWith('image/')) return 'image'
  if (mimeType.startsWith('audio/')) return 'audio'
  return 'document'
}

function toAttachmentCandidate(raw: unknown): unknown {
  const attachment = asRecord(raw)
  const mimeType = typeof attachment.contentType === 'string' ? attachment.contentType : ''
  return {
    filename: attachment.fileName,
    id: attachment.id,
    kind: attachmentKindOf(mimeType),
    mimeType,
    sizeBytes: attachment.sizeBytes,
  }
}

/** A forma da API (`bodyText`, `contentType`…) na do pacote; quem valida é o schema do contracts. */
export function toParticipantMessageCandidate(raw: unknown): unknown {
  const message = asRecord(raw)
  const status = PARTICIPANT_MESSAGE_STATUSES.find((candidate) => candidate === message.status)
  return {
    attachments: Array.isArray(message.attachments)
      ? (message.attachments as readonly unknown[]).map(toAttachmentCandidate)
      : [],
    authorName: message.authorName ?? undefined,
    createdAt: message.createdAt,
    direction: message.direction,
    id: message.id,
    status,
    text: message.bodyText,
  }
}

/** Url assinada por anexo, para o `resolveAttachmentUrl` (a API não tem rota de download à parte). */
export function readAttachmentUrls(raw: unknown): ReadonlyMap<string, string> {
  const urls = new Map<string, string>()
  const { attachments } = asRecord(raw)
  if (!Array.isArray(attachments)) return urls
  for (const item of attachments as readonly unknown[]) {
    const { id, url } = asRecord(item)
    if (typeof id === 'string' && typeof url === 'string') urls.set(id, url)
  }
  return urls
}

/** A última mensagem é da operação e posterior à última do motorista. */
export function isAwaitingParticipant(messages: readonly ParticipantMessage[]): boolean {
  const sorted = [...messages].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
  const last = sorted.at(-1)
  return last !== undefined && last.direction === 'outbound'
}

export type ConversationSummaryInput = Readonly<{
  fallbackSubjectLabel: string
  isAwaitingParticipant: boolean
  raw: unknown
}>

export function toConversationSummaryCandidate(input: ConversationSummaryInput): unknown {
  const summary = asRecord(input.raw)
  const label = typeof summary.occurrenceLabel === 'string' ? summary.occurrenceLabel.trim() : ''
  return {
    awaitingParticipant: input.isAwaitingParticipant,
    lastMessageAt: summary.lastMessageAt ?? null,
    status: 'open',
    subjectId: summary.occurrenceId,
    subjectLabel: label === '' ? input.fallbackSubjectLabel : label,
    subjectType: DRIVER_CONVERSATION_SUBJECT_TYPE,
    unreadCount: summary.unreadCount,
  }
}
