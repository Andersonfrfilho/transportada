/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { OccurrenceConversationMessage } from './occurrenceConversation.types'

const FAILED_STATUSES = new Set(['failed', 'bounced'])
const PREVIEW_LIMIT = 120

export type OccurrenceThreadSummary = Readonly<{
  attachments: number
  failed: number
  inbound: number
  lastAt: null | string
  lastDirection: 'inbound' | 'outbound' | null
  lastPreview: string
  outbound: number
  total: number
}>

function previewOf(message: OccurrenceConversationMessage): string {
  const text = message.bodyText.replace(/\s+/g, ' ').trim()
  if (text === '') return message.attachments[0]?.fileName ?? ''
  return text.length > PREVIEW_LIMIT ? `${text.slice(0, PREVIEW_LIMIT - 1)}…` : text
}

/** O resumo no topo do fio: só contas sobre o que já está carregado, sem chamada nova e sem texto gerado. */
export function summarizeOccurrenceThread(
  messages: readonly OccurrenceConversationMessage[],
): OccurrenceThreadSummary {
  const last = messages.reduce<OccurrenceConversationMessage | undefined>(
    (latest, message) =>
      latest === undefined || Date.parse(message.createdAt) >= Date.parse(latest.createdAt)
        ? message
        : latest,
    undefined,
  )
  return {
    attachments: messages.reduce((sum, message) => sum + message.attachments.length, 0),
    failed: messages.filter(
      (message) => message.status !== null && FAILED_STATUSES.has(message.status),
    ).length,
    inbound: messages.filter((message) => message.direction === 'inbound').length,
    lastAt: last?.createdAt ?? null,
    lastDirection: last?.direction ?? null,
    lastPreview: last === undefined ? '' : previewOf(last),
    outbound: messages.filter((message) => message.direction === 'outbound').length,
    total: messages.length,
  }
}
