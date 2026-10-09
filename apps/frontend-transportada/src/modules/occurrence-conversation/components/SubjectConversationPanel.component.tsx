/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import {
  useCloseSubjectConversationMutation,
  useMarkSubjectReadMutation,
  useOpenSubjectConversationMutation,
  useSubjectConversationsQuery,
  useSubjectMessagesQuery,
} from '../queries/subjectConversation.query'
import {
  findSubjectConversation,
  resolveSubjectConversationAccess,
  resolveSubjectConversationErrorKey,
} from '../shared/subjectConversation.service'
import type { SubjectConversationRef } from '../shared/subjectConversation.types'
import styles from '../styles/occurrenceConversation.module.css'
import { SubjectConversationComposer } from './SubjectConversationComposer.component'
import { SubjectConversationHeader } from './SubjectConversationHeader.component'
import { SubjectConversationThread } from './SubjectConversationThread.component'

type SubjectConversationPanelProps = Readonly<{
  canManage: boolean
  companyId?: string
  subject: SubjectConversationRef
  tripStatus: string
}>

/**
 * Spec 260 T3.2: a conversa de um assunto (nota ou viagem) do ponto de vista do escritório. O resumo
 * (protocolo, canais, status, não lidas) e as mensagens se releem a cada 15 s e ao voltar o foco; abrir
 * a conversa com mensagem do motorista a marca como lida para quem a abriu.
 */
export function SubjectConversationPanel({
  canManage,
  companyId,
  subject,
  tripStatus,
}: SubjectConversationPanelProps) {
  const { t } = useTranslation('subjectConversation')
  const identity = companyId === undefined ? {} : { companyId }
  const conversations = useSubjectConversationsQuery({
    ...identity,
    enabled: true,
    poll: true,
    tripId: subject.tripId,
  })
  const messages = useSubjectMessagesQuery({ ...identity, enabled: true, subject })
  const open = useOpenSubjectConversationMutation()
  const close = useCloseSubjectConversationMutation()
  const { mutate: markRead } = useMarkSubjectReadMutation()
  const summary = findSubjectConversation(conversations.data, subject)
  const access = resolveSubjectConversationAccess({ canManage, summary, tripStatus })
  const unreadCount = summary?.unreadCount ?? 0

  const { subjectId, subjectType, tripId } = subject
  useEffect(() => {
    if (messages.isSuccess && unreadCount > 0) markRead({ subjectId, subjectType, tripId })
  }, [markRead, messages.isSuccess, subjectId, subjectType, tripId, unreadCount])

  if (
    messages.isLoading ||
    conversations.isLoading ||
    (summary === undefined && conversations.isFetching)
  ) {
    return (
      <SkeletonGroup label={t('panel.loading')}>
        <Skeleton height="2rem" width="40%" />
        <Skeleton height="10rem" width="100%" />
      </SkeletonGroup>
    )
  }
  if (messages.isError || summary === undefined) {
    return (
      <p className={styles.hint} role="alert">
        {t('panel.error')}
      </p>
    )
  }

  const stateError = open.error ?? close.error
  return (
    <div className={styles.panel}>
      <SubjectConversationHeader summary={summary} />
      {(messages.data ?? []).length === 0 ? (
        <p className={styles.hint}>{t('panel.empty')}</p>
      ) : (
        <SubjectConversationThread messages={messages.data ?? []} />
      )}
      {access.isClosed ? (
        <p className={styles.hint} role="status">
          {summary.status === 'closed' ? t('panel.closedNotice') : t('panel.tripOverNotice')}
        </p>
      ) : null}
      {access.canSend ? <SubjectConversationComposer subject={subject} /> : null}
      {stateError === null ? null : (
        <p className={styles.error} role="alert">
          {t(`error.${resolveSubjectConversationErrorKey(stateError)}`)}
        </p>
      )}
      <div className={styles.footer}>
        {access.canClose ? (
          <Button
            disabled={close.isPending}
            onClick={() => close.mutate(subject)}
            type="button"
            variant="secondary"
          >
            {close.isPending ? t('panel.closing') : t('panel.close')}
          </Button>
        ) : null}
        {access.canOpen ? (
          <Button
            disabled={open.isPending}
            onClick={() => open.mutate(subject)}
            type="button"
            variant="secondary"
          >
            {open.isPending ? t('panel.reopening') : t('panel.reopen')}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
