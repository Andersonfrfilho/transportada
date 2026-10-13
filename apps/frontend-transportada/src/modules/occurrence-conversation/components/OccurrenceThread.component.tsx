/* Copyright (c) 2026 Ada Technology. MIT License. */
import { ConversationThread } from '@adatechnology/conversations-ui/participant'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import type { OccurrenceThreadParticipant } from '../shared/occurrenceThreadApi.service'
import { SUBJECT_AUDIO_RECORDING_OPTIONS } from '../shared/subjectAudioRecording.service'
import { buildSubjectThreadLabels } from '../shared/subjectThreadLabels.service'
import { useOccurrenceThread } from '../shared/useOccurrenceThread.hook'
import subjectStyles from '../styles/subjectConversation.module.css'
import styles from '../styles/occurrenceThread.module.css'
import { ParticipantAvatar, participantToneClass } from './ParticipantBadge.component'

const THREAD_CHANNELS = {
  contractor: ['email', 'portal'],
  driver: ['app'],
} as const

type OccurrenceThreadProps = Readonly<{
  /** Por que não se escreve aqui (sem permissão, sem portal…); só aparece com `status="closed"`. */
  closedNotice: string
  companyId?: string
  counterpartLabel: string
  headerActions?: ReactNode
  occurrenceId: string
  participant: OccurrenceThreadParticipant
  status: 'closed' | 'open'
  title: string
}>

/**
 * Spec 263 D10 + a conversa da ocorrência: o fio das abas Contratante e Motorista é o `ConversationThread` do SDK na
 * visão do escritório — o mesmo desenho do app do motorista e da conversa por assunto. Mensagem minha é a que o
 * operador escreveu (`outbound`); o canal vai no nome; o envio, o áudio e as respostas rápidas são do SDK.
 */
export function OccurrenceThread({
  closedNotice,
  companyId,
  counterpartLabel,
  headerActions,
  occurrenceId,
  participant,
  status,
  title,
}: OccurrenceThreadProps) {
  const { i18n, t } = useTranslation('subjectConversation')
  const { t: tOccurrence } = useTranslation('occurrenceConversation')
  const { api, speakerOf, threadQuickReplies, threadSubject } = useOccurrenceThread({
    ...(companyId === undefined ? {} : { companyId }),
    occurrenceId,
    participant,
  })
  const labels = {
    ...buildSubjectThreadLabels((key) => t(key), closedNotice),
    ...(participant === 'contractor'
      ? { newMessages: tOccurrence('thread.contractorNewMessages') }
      : {}),
  }

  return (
    <div className={`${styles.frame} ${participantToneClass(participant)}`}>
      <ConversationThread
        api={api}
        audioRecording={SUBJECT_AUDIO_RECORDING_OPTIONS}
        renderAuthorAvatar={(author) => <ParticipantAvatar participant={speakerOf(author.name)} />}
        channels={[...THREAD_CHANNELS[participant]]}
        className={subjectStyles.conversationTheme ?? ''}
        counterpartLabel={counterpartLabel}
        {...(headerActions === undefined ? {} : { headerActions })}
        labels={labels}
        locale={i18n.language}
        perspective="operator"
        quickReplies={threadQuickReplies}
        status={status}
        subject={threadSubject}
        title={title}
      />
    </div>
  )
}
