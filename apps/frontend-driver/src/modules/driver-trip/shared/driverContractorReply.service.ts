/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ContractorReplyStatus, DriverRegisteredOccurrence } from './driverTrip.types'

export const CONTRACTOR_REPLY_STAGE = {
  DELIVERED: 'delivered',
  RECEIVED: 'received',
  WAITING: 'waiting',
} as const
export type ContractorReplyStage =
  (typeof CONTRACTOR_REPLY_STAGE)[keyof typeof CONTRACTOR_REPLY_STAGE]

const STAGE_BY_STATUS: Readonly<Record<ContractorReplyStatus, ContractorReplyStage | undefined>> = {
  awaiting_contractor: CONTRACTOR_REPLY_STAGE.WAITING,
  awaiting_operator: CONTRACTOR_REPLY_STAGE.RECEIVED,
  cancelled: undefined,
  delivered: CONTRACTOR_REPLY_STAGE.DELIVERED,
  handled: undefined,
  needs_operator: CONTRACTOR_REPLY_STAGE.RECEIVED,
  overdue: CONTRACTOR_REPLY_STAGE.WAITING,
  reply_received: CONTRACTOR_REPLY_STAGE.RECEIVED,
}

const STAGE_ORDER: readonly ContractorReplyStage[] = [
  CONTRACTOR_REPLY_STAGE.WAITING,
  CONTRACTOR_REPLY_STAGE.RECEIVED,
  CONTRACTOR_REPLY_STAGE.DELIVERED,
]

/**
 * Spec 248 T5.4 (RF13): o motorista vê três estados simples, e o prazo, o atraso e o que o escritório ainda
 * decide ficam no painel. "Tratado" e "cancelado" não dizem nada ao motorista e saem. Um estado por linha,
 * mesmo com várias ocorrências na nota, do mais cedo para o mais adiantado.
 */
export function listContractorReplyStages(
  occurrences: readonly DriverRegisteredOccurrence[] | undefined,
): readonly ContractorReplyStage[] {
  if (occurrences === undefined) return []
  const present = new Set<ContractorReplyStage>()
  for (const occurrence of occurrences) {
    if (occurrence.contractorReply === null) continue
    const stage = STAGE_BY_STATUS[occurrence.contractorReply.status]
    if (stage !== undefined) present.add(stage)
  }
  return STAGE_ORDER.filter((stage) => present.has(stage))
}
