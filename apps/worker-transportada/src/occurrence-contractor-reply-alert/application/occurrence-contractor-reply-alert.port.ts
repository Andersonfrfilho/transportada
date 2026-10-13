/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { ContractorReplyAlertStopReason } from '../../occurrence-conversation/domain/contractor-reply.policy.js'

export type DueContractorReply = Readonly<{ companyId: string; replyId: string }>

export type ListDueContractorRepliesParams = Readonly<{
  /** Quem já foi visto neste ciclo: uma corrida perdida não muda a linha e voltaria no lote seguinte. */
  excludeReplyIds: readonly string[]
  limit: number
  now: Date
}>

export type OccurrenceContractorReplyAlertQueuePort = Readonly<{
  listDue: (params: ListDueContractorRepliesParams) => Promise<readonly DueContractorReply[]>
}>

export type ApplyContractorReplyAlertParams = Readonly<{
  companyId: string
  now: Date
  replyId: string
}>

/** Quem despachou a viagem e como a ocorrência se chama no aviso (nota ou tipo): nunca PII. */
export type ContractorReplyAlertRecipient = Readonly<{
  occurrenceLabel: string
  recipientUserId: string
}>

export type ApplyContractorReplyAlertResult =
  | Readonly<{
      alertNumber: number
      becomesOverdue: boolean
      kind: 'alerted'
      /** `null`: viagem sem despacho — fica o selo e o filtro "Atrasadas", sem aviso no sino. */
      recipient: ContractorReplyAlertRecipient | null
    }>
  | Readonly<{
      kind: 'skipped'
      reason: ContractorReplyAlertStopReason | 'conflict' | 'invalid_configuration' | 'not_found'
    }>

export type OccurrenceContractorReplyAlertStorePort = Readonly<{
  /** Uma transação: trava o retorno, decide, move por `alert_count` e grava o evento. */
  applyAlert: (params: ApplyContractorReplyAlertParams) => Promise<ApplyContractorReplyAlertResult>
}>

export type NotifyContractorReplyAlertParams = Readonly<{
  alertNumber: number
  companyId: string
  recipient: ContractorReplyAlertRecipient
  replyId: string
}>

export type ContractorReplyAlertNotifierPort = Readonly<{
  notify: (params: NotifyContractorReplyAlertParams) => Promise<void>
}>
