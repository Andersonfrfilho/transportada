/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 T2.4b (api-contract): o resumo da conversa de nota e de viagem na lista do escritório — o do
 * motorista com o nome curto do destinatário e a contagem de não lidas do ponto de vista de quem opera —
 * e a mensagem, que traz o nome de quem escreveu nos dois sentidos.
 */
import { shortenDriverName } from '../domain/office-subject-conversation.policy.js'
import type { ConversationAttachmentView } from './conversation-attachment.port.js'
import type { SubjectMessageRecord } from './driver-conversation-subject.port.js'
import type { DriverSubjectConversationSummary } from './driver-subject-conversation.types.js'
import { toSubjectConversationSummary } from './driver-subject-conversation.types.js'
import type { OfficeSubjectRow } from './office-subject-conversation.port.js'

export type OfficeSubjectSummary = DriverSubjectConversationSummary & {
  readonly driverName: null | string
}

export type OfficeSubjectMessage = Omit<SubjectMessageRecord, 'createdAt'> & {
  readonly attachments: readonly ConversationAttachmentView[]
  readonly createdAt: string
}

export function toOfficeSubjectSummary(row: OfficeSubjectRow): OfficeSubjectSummary {
  return { ...toSubjectConversationSummary(row), driverName: shortenDriverName(row.driverName) }
}
