/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useSubjectConversationsQuery } from '../queries/subjectConversation.query'
import { countSubjectUnread } from '../shared/subjectConversation.service'
import styles from '../styles/occurrenceConversation.module.css'
import listStyles from '../styles/subjectConversation.module.css'
import { SubjectConversationAction } from './SubjectConversationAction.component'
import { SubjectConversationTags } from './SubjectConversationHeader.component'

type TripConversationsPanelProps = Readonly<{
  canManage: boolean
  /** `fleet.read`: sem ele o painel nem aparece (a lista da viagem seria 403). */
  canRead: boolean
  companyId?: string
  tripId: string
  tripStatus: string
}>

/**
 * Spec 260 T3.1/T3.2 (RF12): o painel "Conversas" da viagem — o botão da conversa da viagem e a lista das
 * conversas de nota e de viagem, com protocolo, assunto, motorista, canais, estado e não lidas. É este
 * painel que mantém a lista relida (15 s e foco); os botões das notas leem a mesma chave.
 */
export function TripConversationsPanel({
  canManage,
  canRead,
  companyId,
  tripId,
  tripStatus,
}: TripConversationsPanelProps) {
  const { t } = useTranslation('subjectConversation')
  const identity = companyId === undefined ? {} : { companyId }
  const query = useSubjectConversationsQuery({ ...identity, enabled: canRead, poll: true, tripId })
  if (!canRead) return null

  const conversations = query.data ?? []
  const totalUnread = countSubjectUnread(conversations)
  return (
    <section aria-labelledby={`trip-conversations-title-${tripId}`} className={styles.panel}>
      <div className={styles.panelHead}>
        <h3 id={`trip-conversations-title-${tripId}`}>{t('list.title')}</h3>
        {totalUnread > 0 ? (
          <span className={listStyles.unread}>{t('list.totalUnread', { count: totalUnread })}</span>
        ) : null}
        <SubjectConversationAction
          canManage={canManage}
          canRead={canRead}
          {...identity}
          subjectId={tripId}
          subjectType="trip"
          tripId={tripId}
          tripStatus={tripStatus}
        />
      </div>
      {query.isLoading ? (
        <SkeletonGroup label={t('list.loading')}>
          <Skeleton height="4rem" width="100%" />
        </SkeletonGroup>
      ) : null}
      {query.isError ? (
        <p className={styles.hint} role="alert">
          {t('list.error')}
        </p>
      ) : null}
      {query.isSuccess && conversations.length === 0 ? (
        <p className={styles.hint}>{t('list.empty')}</p>
      ) : null}
      {conversations.length === 0 ? null : (
        <ul aria-label={t('list.ariaLabel')} className={listStyles.list}>
          {conversations.map((summary) => (
            <li className={listStyles.listItem} key={`${summary.subjectType}:${summary.subjectId}`}>
              <div>
                <div className={listStyles.listItemHead}>
                  <h4 className={listStyles.listItemTitle}>{summary.subjectLabel}</h4>
                  {summary.status === 'open' && summary.unreadCount > 0 ? (
                    <span className={listStyles.unread}>
                      {t('action.unread', { count: summary.unreadCount })}
                    </span>
                  ) : null}
                </div>
                <p className={listStyles.preview}>
                  {summary.driverName ?? t('list.noDriver')}
                  {summary.lastMessagePreview === undefined
                    ? ''
                    : ` · ${summary.lastMessagePreview}`}
                </p>
                <SubjectConversationTags summary={summary} />
              </div>
              <SubjectConversationAction
                canManage={canManage}
                canRead={canRead}
                {...identity}
                subjectId={summary.subjectId}
                subjectType={summary.subjectType}
                tripId={tripId}
                tripStatus={tripStatus}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
