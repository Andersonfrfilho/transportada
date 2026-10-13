import type { IconName } from '@/components/ui/icon'
/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * Spec 248 RF13/RF6 (T5.3): o que o painel diz do retorno da contratante. Funções puras: o estado em texto
 * (chave de rótulo + parâmetros), o tom do selo, o que o operador pode fazer e a validação da nota do
 * "Marcar como tratado". Quem decide o estado é a API; aqui só se descreve.
 */
import { isRecord } from './occurrenceConversationGuards.validation'
import {
  CONTRACTOR_REPLY_HANDLED_NOTE_MAX_LENGTH,
  CONTRACTOR_REPLY_STATUSES,
  type ContractorReplySummary,
  type ContractorReplyStatus,
  type ContractorReplyView,
} from './contractorReply.types'

export type ContractorReplyTone = 'info' | 'secondary' | 'success' | 'warning'

export type ContractorReplyStateView = Readonly<{
  alertCount: number
  /** O ícone do estado: o olho acha o símbolo antes de ler a frase (web.md §9). */
  iconName: IconName
  /** `true` quando o prazo passou e a API ainda não virou o retorno para "atrasada". */
  isDeadlinePassed: boolean
  labelKey: string
  reasonKey: null | string
  tone: ContractorReplyTone
}>

/** Um símbolo por estado do retorno; repete-se na lista, no painel e na linha do tempo. */
export const ICON_BY_STATUS: Readonly<Record<ContractorReplyStatus, IconName>> = {
  awaiting_contractor: 'clock',
  awaiting_operator: 'document',
  cancelled: 'close',
  delivered: 'check',
  handled: 'check',
  needs_operator: 'alert',
  overdue: 'alert',
  reply_received: 'document',
}

/** Para onde o boleto foi: o chat do motorista ou um e-mail. */
export const ICON_BY_DELIVERY_TARGET: Readonly<Record<string, IconName>> = {
  driver_app_chat: 'truck',
  driver_whatsapp: 'message',
  informed_email: 'send',
  note_recipient_email: 'send',
}

/** O que aconteceu com a entrega. */
export const ICON_BY_DELIVERY_STATUS: Readonly<Record<string, IconName>> = {
  failed: 'alert',
  pending_window: 'clock',
  queued: 'clock',
  sent: 'check',
  skipped: 'minus',
}

const TONE_BY_STATUS: Readonly<Record<ContractorReplyStatus, ContractorReplyTone>> = {
  awaiting_contractor: 'info',
  awaiting_operator: 'warning',
  cancelled: 'secondary',
  delivered: 'success',
  handled: 'success',
  needs_operator: 'warning',
  overdue: 'warning',
  reply_received: 'info',
}

/** Os estados em que o operador ainda pode encerrar o assunto à mão; `delivered` e `cancelled` são finais. */
const HANDLEABLE_STATUSES: readonly ContractorReplyStatus[] = [
  'awaiting_contractor',
  'overdue',
  'reply_received',
  'awaiting_operator',
  'needs_operator',
]

export function describeContractorReplyState(
  reply: Pick<ContractorReplyView, 'alertCount' | 'deadlineAt' | 'reason' | 'status'>,
  now: Date,
): ContractorReplyStateView {
  const deadline = reply.deadlineAt === null ? null : new Date(reply.deadlineAt)
  const isWaiting = reply.status === 'awaiting_contractor'
  return {
    alertCount: reply.status === 'overdue' ? reply.alertCount : 0,
    isDeadlinePassed:
      isWaiting && deadline !== null && !Number.isNaN(deadline.getTime()) && deadline <= now,
    iconName: ICON_BY_STATUS[reply.status],
    labelKey: `contractorReply.status.${reply.status}`,
    reasonKey:
      reply.status === 'needs_operator' && reply.reason !== null
        ? `contractorReply.reason.${reply.reason}`
        : null,
    tone: TONE_BY_STATUS[reply.status],
  }
}

/** Leitura tolerante da listagem: ausente ou malformado é "sem retorno", nunca reprova a linha. */
export function toContractorReplySummary(value: unknown): ContractorReplySummary | null {
  if (!isRecord(value)) return null
  const knownStatus = CONTRACTOR_REPLY_STATUSES.find((candidate) => candidate === value.status)
  if (knownStatus === undefined || typeof value.alertCount !== 'number') return null
  return { alertCount: value.alertCount, status: knownStatus }
}

export function canMarkContractorReplyHandled(status: ContractorReplyStatus): boolean {
  return HANDLEABLE_STATUSES.includes(status)
}

/** O boleto já aceito e ainda parado no operador: é o que "Enviar ao motorista" leva. */
export function canDeliverContractorReplyToDriver(
  reply: Pick<ContractorReplyView, 'replyAttachmentId' | 'status'>,
): boolean {
  return reply.status === 'awaiting_operator' && reply.replyAttachmentId !== null
}

export type HandledNoteResult =
  | Readonly<{ error: 'required' | 'tooLong' }>
  | Readonly<{ note: string }>

export function validateHandledNote(draft: string): HandledNoteResult {
  const note = draft.trim()
  if (note.length === 0) return { error: 'required' }
  if (note.length > CONTRACTOR_REPLY_HANDLED_NOTE_MAX_LENGTH) return { error: 'tooLong' }
  return { note }
}
