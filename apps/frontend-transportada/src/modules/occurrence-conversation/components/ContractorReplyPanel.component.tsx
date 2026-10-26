/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { Tooltip } from '@/components/ui/tooltip'
import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import { useContractorReplyQuery } from '../queries/contractorReply.query'
import {
  canDeliverContractorReplyToDriver,
  canMarkContractorReplyHandled,
  describeContractorReplyState,
  describeResendAction,
} from '../shared/contractorReply.service'
import { isContractorReplyBoletoAccepted } from '../shared/contractorReplyEmail.service'
import type { ContractorReplyView } from '../shared/contractorReply.types'
import styles from '../styles/contractorReply.module.css'
import conversationStyles from '../styles/occurrenceConversation.module.css'
import { ClientBoletoEmailAction } from './ClientBoletoEmailAction.component'
import { ContractorReplyHandledForm } from './ContractorReplyHandledForm.component'
import { ContractorReplyResendAction } from './ContractorReplyResendAction.component'
import { ContractorReplyTimeline } from './ContractorReplyTimeline.component'
import { SendToDriverAction } from './OccurrenceConversations.component'

type ContractorReplyPanelProps = Readonly<{
  canResolve: boolean
  companyId?: string
  /** O retorno só existe para ocorrência de nota; a de parada não pergunta à API. */
  hasDocument: boolean
  occurrenceId: string
}>

function ContractorReplyFacts({ reply }: Readonly<{ reply: ContractorReplyView }>) {
  const { t } = useTranslation('occurrenceConversation')
  const formatMoment = useMomentFormatter()
  const state = describeContractorReplyState(reply, new Date())
  const isWaiting = reply.status === 'awaiting_contractor' || reply.status === 'overdue'

  return (
    <dl className={styles.facts}>
      {isWaiting && reply.deadlineAt !== null ? (
        <div>
          <dt>
            <Icon name="calendar" size="sm" />
            {t('contractorReply.deadline')}
          </dt>
          <dd>
            {formatMoment(reply.deadlineAt)}
            {state.isDeadlinePassed ? ` · ${t('contractorReply.deadlinePassed')}` : null}
          </dd>
        </div>
      ) : null}
      {reply.status === 'overdue' ? (
        <div>
          <dt>
            <Icon name="alert" size="sm" />
            {t('contractorReply.alertsLabel')}
          </dt>
          <dd>
            {t('contractorReply.alertsProgress', {
              count: reply.alertCount,
              max: reply.alertMaxCount,
            })}
          </dd>
        </div>
      ) : null}
      {state.reasonKey === null ? null : (
        <div>
          <dt>
            <Icon name="alert" size="sm" />
            {t('contractorReply.reasonLabel')}
          </dt>
          <dd>{t(state.reasonKey)}</dd>
        </div>
      )}
      {reply.handledNote === null ? null : (
        <div>
          <dt>
            <Icon name="edit" size="sm" />
            {t('contractorReply.handledNoteLabel')}
          </dt>
          <dd className={styles.note}>{reply.handledNote}</dd>
        </div>
      )}
    </dl>
  )
}

/**
 * Spec 248 RF13/RF6 (T5.3): o painel do retorno da contratante no topo da conversa da ocorrência — estado em
 * texto, prazo, alertas, linha do tempo e, para quem conduz a tratativa, "Marcar como tratado".
 */
export function ContractorReplyPanel({
  canResolve,
  companyId,
  hasDocument,
  occurrenceId,
}: ContractorReplyPanelProps) {
  const { t } = useTranslation('occurrenceConversation')
  const query = useContractorReplyQuery({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: hasDocument,
    occurrenceId,
  })

  if (!hasDocument) return null
  if (query.isLoading) {
    return (
      <SkeletonGroup label={t('contractorReply.loading')}>
        <Skeleton height="1.5rem" width="50%" />
        <Skeleton height="4rem" width="100%" />
      </SkeletonGroup>
    )
  }
  if (query.isError) {
    return (
      <p className={conversationStyles.hint} role="alert">
        {t('contractorReply.error')}
      </p>
    )
  }
  const reply = query.data
  if (reply === null || reply === undefined) return null

  const state = describeContractorReplyState(reply, new Date())
  const statusText = [
    t(state.labelKey),
    state.alertCount > 0 ? t('contractorReply.alerts', { count: state.alertCount }) : null,
  ]
    .filter((part) => part !== null)
    .join(' · ')
  const badgeText = state.reasonKey === null ? statusText : `${statusText} (${t(state.reasonKey)})`

  return (
    <section
      aria-labelledby="contractor-reply-title"
      className={styles.panel}
      data-status={reply.status}
    >
      <div className={conversationStyles.panelHead}>
        <h3 id="contractor-reply-title">
          <Icon name="invoice" size="sm" />
          {t('contractorReply.title')}
        </h3>
        <Tooltip label={t(`contractorReply.hint.${reply.status}`)}>
          <Badge
            className={styles.statusBadge}
            data-status={reply.status}
            key={reply.status}
            tabIndex={0}
            variant={state.tone}
          >
            <Icon name={state.iconName} size="sm" />
            {badgeText}
          </Badge>
        </Tooltip>
      </div>
      <ContractorReplyFacts reply={reply} />
      {canResolve &&
      (canDeliverContractorReplyToDriver(reply) ||
        canMarkContractorReplyHandled(reply.status) ||
        describeResendAction(reply).kind !== 'hidden') ? (
        <div className={styles.actions}>
          {canDeliverContractorReplyToDriver(reply) && reply.replyAttachmentId !== null ? (
            <SendToDriverAction
              attachmentId={reply.replyAttachmentId}
              occurrenceId={occurrenceId}
            />
          ) : null}
          <ContractorReplyResendAction occurrenceId={occurrenceId} reply={reply} />
          {canMarkContractorReplyHandled(reply.status) ? (
            <ContractorReplyHandledForm occurrenceId={occurrenceId} />
          ) : null}
        </div>
      ) : null}
      {canResolve && isContractorReplyBoletoAccepted(reply.status) ? (
        <div className={styles.actions}>
          <ClientBoletoEmailAction occurrenceId={occurrenceId} placement="page" />
        </div>
      ) : null}
      <ContractorReplyTimeline deliveries={reply.deliveries} events={reply.events} />
    </section>
  )
}
