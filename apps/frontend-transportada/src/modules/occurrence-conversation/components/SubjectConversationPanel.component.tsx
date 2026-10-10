/* Copyright (c) 2026 Ada Technology. MIT License. */
import { ConversationThread } from '@adatechnology/conversations-ui/participant'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import {
  useCloseSubjectConversationMutation,
  useOpenSubjectConversationMutation,
  useRefreshSubjectConversations,
  useSubjectConversationsQuery,
} from '../queries/subjectConversation.query'
import {
  findSubjectConversation,
  resolveSubjectConversationAccess,
  resolveSubjectConversationErrorKey,
} from '../shared/subjectConversation.service'
import type {
  SubjectConversationRef,
  SubjectConversationSummary,
} from '../shared/subjectConversation.types'
import { buildSubjectThreadLabels } from '../shared/subjectThreadLabels.service'
import { useSubjectThread } from '../shared/useSubjectThread.hook'
import styles from '../styles/subjectConversation.module.css'
import { SubjectThreadActions } from './SubjectThreadActions.component'

type SubjectConversationPanelProps = Readonly<{
  canManage: boolean
  companyId?: string
  onClose: () => void
  subject: SubjectConversationRef
  tripStatus: string
}>

type SubjectThreadViewProps = Readonly<{
  canManage: boolean
  onClose: () => void
  subject: SubjectConversationRef
  summary: SubjectConversationSummary
  tripStatus: string
}>

function SubjectThreadView({
  canManage,
  onClose,
  subject,
  summary,
  tripStatus,
}: SubjectThreadViewProps) {
  const { i18n, t } = useTranslation('subjectConversation')
  const { api, threadQuickReplies, threadSubject } = useSubjectThread(subject)
  const refresh = useRefreshSubjectConversations()
  const open = useOpenSubjectConversationMutation()
  const close = useCloseSubjectConversationMutation()
  const access = resolveSubjectConversationAccess({ canManage, summary, tripStatus })
  const closedNotice = access.isClosed
    ? t(summary.status === 'closed' ? 'panel.closedNotice' : 'panel.tripOverNotice')
    : t('panel.readOnlyNotice')
  const stateError = open.error ?? close.error
  const driverLabel =
    summary.driverName === null
      ? t('panel.noDriverName')
      : t('panel.driver', { name: summary.driverName })

  return (
    <div className={styles.threadPanel}>
      <ConversationThread
        api={api}
        avatars="initials"
        channels={[...summary.channels]}
        className={styles.conversationTheme ?? ''}
        counterpartLabel={driverLabel}
        headerActions={
          <SubjectThreadActions
            canClose={access.canClose}
            canOpen={access.canOpen}
            isPending={open.isPending || close.isPending}
            onClose={() => close.mutate(subject)}
            onOpen={() => open.mutate(subject)}
          />
        }
        labels={buildSubjectThreadLabels((key) => t(key), closedNotice)}
        locale={i18n.language}
        onBack={onClose}
        onMarkedRead={refresh}
        perspective="operator"
        protocol={summary.protocol}
        quickReplies={threadQuickReplies}
        status={access.canSend ? 'open' : 'closed'}
        subject={threadSubject}
        title={summary.subjectLabel}
      />
      {stateError === null ? null : (
        <p className={styles.notice} role="alert">
          {t(`error.${resolveSubjectConversationErrorKey(stateError)}`)}
        </p>
      )}
    </div>
  )
}

/**
 * Spec 263 T5.2-B (D10): a conversa de um assunto (nota ou viagem) do ponto de vista do escritório, no mesmo
 * desenho do app do motorista — o `ConversationThread` do SDK com `perspective="operator"`. O resumo
 * (protocolo, canais, estado) se relê a cada 15 s; o fio e a leitura (✓✓ azul do motorista) são do SDK.
 */
export function SubjectConversationPanel({
  canManage,
  companyId,
  onClose,
  subject,
  tripStatus,
}: SubjectConversationPanelProps) {
  const { t } = useTranslation('subjectConversation')
  const conversations = useSubjectConversationsQuery({
    ...(companyId === undefined ? {} : { companyId }),
    enabled: true,
    poll: true,
    tripId: subject.tripId,
  })
  const summary = findSubjectConversation(conversations.data, subject)
  if (summary === undefined && conversations.isFetching) {
    return (
      <SkeletonGroup label={t('panel.loading')}>
        <Skeleton height="2rem" width="40%" />
        <Skeleton height="10rem" width="100%" />
      </SkeletonGroup>
    )
  }
  if (summary === undefined) {
    return (
      <p className={styles.notice} role="alert">
        {t('panel.error')}
      </p>
    )
  }
  return (
    <SubjectThreadView
      canManage={canManage}
      onClose={onClose}
      subject={subject}
      summary={summary}
      tripStatus={tripStatus}
    />
  )
}
