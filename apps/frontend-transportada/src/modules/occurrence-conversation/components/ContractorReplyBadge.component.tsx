/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

import { describeContractorReplyState } from '../shared/contractorReply.service'
import type { ContractorReplySummary } from '../shared/contractorReply.types'

type ContractorReplyBadgeProps = Readonly<{
  reply: ContractorReplySummary
}>

/**
 * Spec 248 RF13 (T5.2): o selo do retorno da contratante na lista de ocorrências. Estado em texto, com os
 * alertas contados quando atrasada; o motivo e o prazo moram no painel do detalhe.
 */
export function ContractorReplyBadge({ reply }: ContractorReplyBadgeProps) {
  const { t } = useTranslation('occurrenceConversation')
  const state = describeContractorReplyState(
    { alertCount: reply.alertCount, deadlineAt: null, reason: null, status: reply.status },
    new Date(),
  )
  const text =
    state.alertCount > 0
      ? `${t(state.labelKey)} · ${t('contractorReply.alerts', { count: state.alertCount })}`
      : t(state.labelKey)
  return <Badge variant={state.tone}>{text}</Badge>
}
