/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 263 (T5.4): o status que o app do motorista mostra nas mensagens DELE (`inbound`, gravadas com
 * status nulo). Estar no servidor é `delivered` (dois ticks cinza); `read` (azul) é derivado de a leitura
 * de um usuário do escritório alcançar a mensagem — por ordem de criação, nunca pelo uuid.
 */
import type { OccurrenceConversationMessageStatus } from '../../database/occurrence-conversation.schema.js'

type StatusSubject = {
  readonly createdAt: Date
  readonly direction: 'inbound' | 'outbound'
  readonly status: null | OccurrenceConversationMessageStatus
}

export function deriveOwnMessageStatus(
  message: StatusSubject,
  officeReadHorizon: Date | null,
): null | OccurrenceConversationMessageStatus {
  if (message.direction === 'outbound') return message.status
  if (officeReadHorizon === null) return 'delivered'
  return message.createdAt.getTime() <= officeReadHorizon.getTime() ? 'read' : 'delivered'
}
