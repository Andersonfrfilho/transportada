/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 (api-contract): a forma do resumo e da mensagem que o `/me` devolve, e o resumo que o
 * caso de uso monta a partir do que o repositório leu.
 */
import type { ConversationAttachmentView } from './conversation-attachment.port.js'
import type {
  SubjectConversationRow,
  SubjectMessageRecord,
} from './driver-conversation-subject.port.js'
import { resolveEffectiveConversationStatus } from '../domain/conversation-effective-status.policy.js'
import type { EffectiveConversationStatus } from '../domain/conversation-effective-status.policy.js'
import { orderConversationChannels } from '../domain/conversation-channels.policy.js'
import { buildSubjectLabel } from '../domain/conversation-subject-label.policy.js'
import type { SubjectChannel } from '../domain/driver-subject-conversation.constant.js'
import type { OccurrenceConversationSubjectType } from '../../shared/occurrence-conversation-subject.constant.js'

export type DriverSubjectConversationSummary = {
  readonly awaitingDriver: boolean
  readonly channels: readonly SubjectChannel[]
  readonly iconName?: string
  readonly lastMessageAt: string | null
  readonly lastMessageDirection?: 'inbound' | 'outbound'
  readonly lastMessagePreview?: string
  /** Quando o escritório leu até uma mensagem do motorista; o app compara para refazer a conversa aberta. */
  readonly officeReadAt?: string
  readonly protocol: string
  readonly status: EffectiveConversationStatus
  readonly subjectId: string
  readonly subjectLabel: string
  readonly subjectType: OccurrenceConversationSubjectType
  readonly tripId: null | string
  readonly unreadCount: number
}

export type DriverSubjectMessage = Omit<SubjectMessageRecord, 'createdAt'> & {
  readonly attachments: readonly ConversationAttachmentView[]
  readonly createdAt: string
}

export function toSubjectConversationSummary(
  row: SubjectConversationRow,
  officeReadAt?: Date,
): DriverSubjectConversationSummary {
  const status = resolveEffectiveConversationStatus(row)
  return {
    awaitingDriver: status === 'open' && row.lastMessageDirection === 'outbound',
    channels: orderConversationChannels(row.channels),
    ...(row.iconName === null ? {} : { iconName: row.iconName }),
    lastMessageAt: row.lastMessageAt === null ? null : row.lastMessageAt.toISOString(),
    ...(row.lastMessageDirection === null
      ? {}
      : { lastMessageDirection: row.lastMessageDirection }),
    ...(row.lastMessagePreview === null || row.lastMessagePreview === ''
      ? {}
      : { lastMessagePreview: row.lastMessagePreview }),
    ...(officeReadAt === undefined ? {} : { officeReadAt: officeReadAt.toISOString() }),
    protocol: row.protocol,
    status,
    subjectId: row.subjectId,
    subjectLabel: buildSubjectLabel(row.labelFacts),
    subjectType: row.subjectType,
    tripId: row.tripId,
    unreadCount: row.unreadCount,
  }
}
