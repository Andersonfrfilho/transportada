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
  type ContractorReplyEvent,
  type ContractorReplySummary,
  type ContractorReplyStatus,
  type ContractorReplyView,
} from './contractorReply.types'

export type ContractorReplyTone = 'info' | 'secondary' | 'success' | 'warning'

export type ContractorReplyStateView = Readonly<{
  alertCount: number
  /** `true` quando o prazo passou e a API ainda não virou o retorno para "atrasada". */
  isDeadlinePassed: boolean
  labelKey: string
  reasonKey: null | string
  tone: ContractorReplyTone
}>

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

export type ResendActionView =
  | Readonly<{ kind: 'enabled' }>
  | Readonly<{ kind: 'hidden' }>
  | Readonly<{ availableAt: null | string; kind: 'disabled'; reasonKey: string }>

/**
 * RF6: "Reenviar o pedido" aparece só enquanto o retorno espera a contratante (aguardando ou atrasada) e a API
 * disse o que vale agora. Desabilitado leva o motivo à vista ("já reenviado há pouco, de novo às HH:mm"); retorno
 * que já não espera, ou API anterior à ação (sem `resend`), não oferece o botão.
 */
export function describeResendAction(
  reply: Pick<ContractorReplyView, 'resend' | 'status'>,
): ResendActionView {
  const isWaiting = reply.status === 'awaiting_contractor' || reply.status === 'overdue'
  if (!isWaiting || reply.resend === null) return { kind: 'hidden' }
  if (reply.resend.canResend) return { kind: 'enabled' }
  if (reply.resend.reason !== 'too_soon') return { kind: 'hidden' }
  return {
    availableAt: reply.resend.availableAt,
    kind: 'disabled',
    reasonKey: 'contractorReply.resend.tooSoon',
  }
}

/** O reenvio é o evento do operador que deixa o retorno no mesmo estado de espera (a API não tem outro com essa forma). */
export function isResendRequestEvent(
  event: Pick<ContractorReplyEvent, 'actorKind' | 'fromStatus' | 'toStatus'>,
): boolean {
  return (
    event.actorKind === 'user' &&
    event.fromStatus === event.toStatus &&
    (event.toStatus === 'awaiting_contractor' || event.toStatus === 'overdue')
  )
}

const RESEND_ERROR_KEY_BY_CODE: Readonly<Record<string, string>> = {
  CONTRACTOR_REPLY_NOT_RESENDABLE: 'contractorReply.resend.error.notResendable',
  CONTRACTOR_REPLY_ORIGINAL_REQUEST_MISSING: 'contractorReply.resend.error.originalMissing',
  CONTRACTOR_REPLY_RESEND_TOO_SOON: 'contractorReply.resend.error.tooSoon',
  OCCURRENCE_CONVERSATION_NO_RECIPIENT: 'contractorReply.resend.error.noRecipient',
}

/** O texto da recusa pelo código estável da API; código que não conhecemos cai no genérico, nunca em silêncio. */
export function resolveResendErrorKey(code: null | string): string {
  return (
    (code === null ? undefined : RESEND_ERROR_KEY_BY_CODE[code]) ??
    'contractorReply.resend.error.send'
  )
}

/** Uma chave por tentativa do operador: repetir o mesmo toque reaproveita a chave e a API devolve a resposta gravada. */
export function createResendRequestIdempotencyKey(randomId: () => string): string {
  return `contractor-reply-resend:${randomId()}`
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
