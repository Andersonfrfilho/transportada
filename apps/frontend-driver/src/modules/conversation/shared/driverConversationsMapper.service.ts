/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ParticipantAttachment } from '@adatechnology/conversation-contracts'

import { conversationSubjectKey } from './conversationSnapshot.service'
import {
  DRIVER_CONVERSATION_SUBJECT_TYPE,
  PARTICIPANT_CHANNELS,
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
    clientMessageId:
      typeof message.clientMessageId === 'string' ? message.clientMessageId : undefined,
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

export type ConversationSummaryInput = Readonly<{
  fallbackSubjectLabel: string
  raw: unknown
}>

function readText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** Só os canais que o pacote conhece: um valor novo da API não pode derrubar a lista inteira. */
function readChannels(value: unknown): readonly string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const known = (value as readonly unknown[]).filter((channel): channel is string =>
    PARTICIPANT_CHANNELS.some((candidate) => candidate === channel),
  )
  return known.length === 0 ? undefined : [...new Set(known)]
}

/** Resumo da rota por assunto; protocolo, canais e ícone só aparecem se a API os mandou. */
export function toConversationSummaryCandidate(input: ConversationSummaryInput): unknown {
  const summary = asRecord(input.raw)
  return {
    awaitingParticipant: summary.awaitingDriver,
    channels: readChannels(summary.channels),
    iconName: readText(summary.iconName),
    lastMessageAt: summary.lastMessageAt ?? null,
    lastMessageDirection: summary.lastMessageDirection,
    lastMessagePreview: readText(summary.lastMessagePreview),
    protocol: readText(summary.protocol),
    status: summary.status,
    subjectId: summary.subjectId,
    subjectLabel: readText(summary.subjectLabel) ?? input.fallbackSubjectLabel,
    subjectType: summary.subjectType,
    unreadCount: summary.unreadCount,
  }
}

/** `officeReadAt` por assunto, direto do payload: o schema do pacote não o conhece, só o snapshot do refresh. */
export function readOfficeReadAtBySubject(payload: unknown): ReadonlyMap<string, string> {
  const readAtBySubject = new Map<string, string>()
  for (const raw of readDataArray(payload)) {
    const { officeReadAt, subjectId, subjectType } = asRecord(raw)
    if (
      typeof officeReadAt === 'string' &&
      typeof subjectId === 'string' &&
      typeof subjectType === 'string'
    ) {
      readAtBySubject.set(conversationSubjectKey({ subjectId, subjectType }), officeReadAt)
    }
  }
  return readAtBySubject
}

/** Resumo da rota antiga (só ocorrência): sem a direção da última mensagem, "espera resposta" é ter não lida. */
export function toLegacyConversationSummaryCandidate(input: ConversationSummaryInput): unknown {
  const summary = asRecord(input.raw)
  return {
    awaitingParticipant: Number(summary.unreadCount) > 0,
    lastMessageAt: summary.lastMessageAt ?? null,
    status: 'open',
    subjectId: summary.occurrenceId,
    subjectLabel: readText(summary.occurrenceLabel) ?? input.fallbackSubjectLabel,
    subjectType: DRIVER_CONVERSATION_SUBJECT_TYPE,
    unreadCount: summary.unreadCount,
  }
}

/** `pagination.nextCursor` da rota nova vira o `nextCursor` do pacote; `null` é fim da lista. */
export function readNextCursor(payload: unknown): string | undefined {
  const { nextCursor } = asRecord(asRecord(payload).pagination)
  return typeof nextCursor === 'string' ? nextCursor : undefined
}
