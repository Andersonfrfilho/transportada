/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { Occurrence, OccurrenceDecisionKind } from '@/modules/shared/portal.types'

export type OccurrenceBadge = 'alert' | 'done' | 'pending'

export type OccurrenceView = Readonly<{
  badge: OccurrenceBadge
  label: string
}>

const DECISION_LABEL: Readonly<Record<OccurrenceDecisionKind, string>> = {
  goods_paid: 'Pagar os produtos',
  other: 'Outra solução',
  redelivery_authorized: 'Autorizar reentrega',
}

const STAGE_LABEL: Readonly<Record<string, string>> = {
  delivery: 'Na entrega',
  separation: 'No galpão',
}

/**
 * `awaiting_contractor` é a única fase em que o contratante decide — o portal nunca mostra
 * `decided`/`closed` como pendência (RF13/RF16, spec 164).
 */
export function toOccurrenceView(occurrence: Occurrence): OccurrenceView {
  if (occurrence.caseStatus === 'awaiting_contractor') {
    return { badge: 'alert', label: 'Aguardando sua decisão' }
  }
  if (occurrence.caseStatus === 'decided') {
    return { badge: 'pending', label: 'Decisão registrada' }
  }

  return { badge: 'done', label: 'Encerrada' }
}

export function isDecidable(occurrence: Occurrence): boolean {
  return occurrence.caseStatus === 'awaiting_contractor'
}

export function decisionLabel(kind: OccurrenceDecisionKind): string {
  return DECISION_LABEL[kind]
}

export function stageLabel(stage: string): string {
  return STAGE_LABEL[stage] ?? stage
}
