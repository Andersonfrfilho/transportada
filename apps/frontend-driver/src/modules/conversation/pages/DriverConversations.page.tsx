/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * A tela de conversa vem do pacote (`@adatechnology/conversations-ui/participant`); aqui só a fiação:
 * rota, adapter, tema e rótulos. Montada uma vez para `/conversas` e `/conversas/:tipo/:id` — o
 * cache da lista e os rascunhos vivem dentro dela. O import é dinâmico para não pesar o boot do PWA.
 */
import type {
  ParticipantConversationsLabels,
  ParticipantSubjectRef,
} from '@adatechnology/conversations-ui/participant'
import { useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense } from 'react'
import { useTranslation } from 'react-i18next'

import { useDriverSession } from '@/modules/driver-trip/hooks/useDriverSession.hook'
import { DriverBottomBar } from '@/modules/driver-trip/components/DriverBottomBar.component'
import {
  navigateToDriverConversation,
  navigateToDriverSection,
  parseDriverConversationSubject,
} from '@/modules/shared/driverRoute.service'

import { createComposerLockRenderer } from '../components/DriverComposerLock.component'
import { useConversationOutbox } from '../hooks/useConversationOutbox.hook'
import { useConversationPathname } from '../hooks/useConversationPathname.hook'
import { useDriverConversationReopen } from '../hooks/useDriverConversationReopen.hook'
import { useDriverQuickReplies } from '../hooks/useDriverQuickReplies.hook'
import { useRouteOccurrenceStates } from '../hooks/useRouteOccurrenceStates.hook'
import {
  DRIVER_CONVERSATION_SUBJECT_TYPE,
  UNREAD_CONVERSATIONS_QUERY_KEY,
} from '../shared/driverConversation.constant'
import { driverAudioRecordingOptions } from '../shared/driverAudioRecording.service'
import { getDriverConversationsApi } from '../shared/driverConversationsApiInstance.service'
import { buildDriverSubjectGroups } from '../shared/driverSubjectGroups.constant'
import { renderDriverSubjectIcon } from '../shared/driverSubjectIcon.service'
import { conversationSubjectKey } from '../shared/conversationSnapshot.service'
import styles from '../styles/conversation.module.css'

const ParticipantConversations = lazy(async () => {
  const module = await import('@adatechnology/conversations-ui/participant')
  return { default: module.ParticipantConversations }
})

export function DriverConversationsPage() {
  const { i18n, t } = useTranslation('conversation')
  const queryClient = useQueryClient()
  const api = getDriverConversationsApi()
  const { isOutboxFull, onRetryPending, pendingMessages } = useConversationOutbox(api)
  const quickReplies = useDriverQuickReplies()
  const selected = parseDriverConversationSubject(useConversationPathname())
  const { canSync } = useDriverSession()
  const { isSettled, stateByOccurrenceId } = useRouteOccurrenceStates(canSync)
  const isStateUnknown =
    selected !== undefined &&
    selected.subjectType === DRIVER_CONVERSATION_SUBJECT_TYPE &&
    isSettled &&
    !stateByOccurrenceId.has(selected.subjectId)
  const { refusal } = useDriverConversationReopen({
    api,
    stateByOccurrenceId,
    selectedKey: selected === undefined ? undefined : conversationSubjectKey(selected),
  })
  const renderComposerLock = createComposerLockRenderer({
    isArmed: api.reopen.isReopening,
    onReopen: api.reopen.arm,
    stateByOccurrenceId,
  })
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

  return (
    <div className={styles.conversationShell}>
      {isOutboxFull ? (
        <p role="alert" className={styles.outboxNotice}>
          {t('outboxFull')}
        </p>
      ) : null}
      {isStateUnknown ? (
        <p role="status" className={styles.outboxNotice}>
          {t('reopen.stateUnknown')}
        </p>
      ) : null}
      {refusal === undefined ? null : (
        <p role="alert" className={styles.outboxNotice}>
          {t(`reopen.refused.${refusal}`)}
        </p>
      )}
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
            audioRecording={driverAudioRecordingOptions}
            avatars="initials"
            className={styles.conversationTheme ?? ''}
            labels={labels}
            locale={i18n.language}
            renderSubjectIcon={renderDriverSubjectIcon}
            selected={selected}
            subjectGroups={subjectGroups}
            pendingMessages={pendingMessages}
            quickReplies={quickReplies}
            renderComposerLock={renderComposerLock}
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
