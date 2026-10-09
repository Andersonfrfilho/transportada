/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * A tela de conversa vem do pacote (`@adatechnology/conversations-ui/participant`); aqui só a fiação:
 * rota, adapter, tema e rótulos. Montada uma vez para `/conversas` e `/conversas/:tipo/:id` — o
 * cache da lista e os rascunhos vivem dentro dela. O import é dinâmico para não pesar o boot do PWA.
 */
import type {
  ParticipantConversationSummary,
  ParticipantConversationsLabels,
  ParticipantSubjectRef,
} from '@adatechnology/conversations-ui/participant'
import { useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { DriverBottomBar } from '@/modules/driver-trip/components/DriverBottomBar.component'
import {
  navigateToDriverConversation,
  navigateToDriverSection,
  parseDriverConversationSubject,
} from '@/modules/shared/driverRoute.service'

import { useConversationOutbox } from '../hooks/useConversationOutbox.hook'
import { useConversationPathname } from '../hooks/useConversationPathname.hook'
import { useDriverQuickReplies } from '../hooks/useDriverQuickReplies.hook'
import { UNREAD_CONVERSATIONS_QUERY_KEY } from '../shared/driverConversation.constant'
import { getDriverConversationsApi } from '../shared/driverConversationsApiInstance.service'
import { buildDriverSubjectGroups } from '../shared/driverSubjectGroups.constant'
import { renderDriverSubjectIcon } from '../shared/driverSubjectIcon.service'
import styles from '../styles/conversation.module.css'

const ParticipantConversations = lazy(async () => {
  const module = await import('@adatechnology/conversations-ui/participant')
  return { default: module.ParticipantConversations }
})

export function DriverConversationsPage() {
  const { i18n, t } = useTranslation('conversation')
  const queryClient = useQueryClient()
  const api = getDriverConversationsApi()
  const { onRetryPending, pendingMessages } = useConversationOutbox(api)
  const quickReplies = useDriverQuickReplies()
  const selected = parseDriverConversationSubject(useConversationPathname())
  const labels = t('labels', { returnObjects: true }) as Partial<ParticipantConversationsLabels>
  const subjectGroups = buildDriverSubjectGroups({
    document: t('groups.document'),
    occurrence: t('groups.occurrence'),
    trip: t('groups.trip'),
  })

  function handleSelect(subject: ParticipantSubjectRef): void {
    navigateToDriverConversation(subject)
  }

  function handleBack(): void {
    navigateToDriverSection('conversations')
    void queryClient.invalidateQueries({ queryKey: UNREAD_CONVERSATIONS_QUERY_KEY })
  }

  function renderSubjectCard(conversation: ParticipantConversationSummary): ReactNode {
    return (
      <div className={styles.subjectCard}>
        <Icon name="message" />
        <span className={styles.subjectCardTitle}>{conversation.subjectLabel}</span>
        <span className={styles.subjectCardType}>
          {t(`subjectCard.${conversation.subjectType}`, { defaultValue: conversation.subjectType })}
        </span>
      </div>
    )
  }

  return (
    <div className={styles.conversationShell}>
      <main className={styles.conversationMain}>
        <Suspense
          fallback={
            <p role="status" className={styles.loadingNotice}>
              {t('loading')}
            </p>
          }
        >
          <ParticipantConversations
            api={api}
            className={styles.conversationTheme ?? ''}
            labels={labels}
            locale={i18n.language}
            renderSubjectCard={renderSubjectCard}
            renderSubjectIcon={renderDriverSubjectIcon}
            selected={selected}
            subjectGroups={subjectGroups}
            pendingMessages={pendingMessages}
            quickReplies={quickReplies}
            onBack={handleBack}
            onRetryPending={onRetryPending}
            onSelect={handleSelect}
          />
        </Suspense>
      </main>
      <DriverBottomBar section="conversations" onSelect={navigateToDriverSection} />
    </div>
  )
}
