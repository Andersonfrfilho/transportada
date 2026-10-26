/* Copyright (c) 2026 Ada Technology. MIT License. */
import {
  ConversationThread,
  type ParticipantMessageMenuOptions,
} from '@adatechnology/conversations-ui/participant'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { initialsOf } from '@/modules/trip/shared/tripOccurrenceDetail.service'

import type {
  OccurrenceThreadParticipant,
  OccurrenceThreadSendError,
} from '../shared/occurrenceThreadApi.service'
import { SUBJECT_AUDIO_RECORDING_OPTIONS } from '../shared/subjectAudioRecording.service'
import {
  buildContractorThreadLabels,
  buildSubjectThreadLabels,
} from '../shared/subjectThreadLabels.service'
import { useOccurrenceThread } from '../shared/useOccurrenceThread.hook'
import subjectStyles from '../styles/subjectConversation.module.css'
import styles from '../styles/occurrenceThread.module.css'
import { OccurrenceDetailsAction } from './OccurrenceDetailsAction.component'
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
  /** Nome de quem está do outro lado (o motorista): sem foto, o balão dele mostra as iniciais. */
  counterpartName?: string
  headerActions?: ReactNode
  occurrenceId: string
  onSendError?: (error: null | OccurrenceThreadSendError) => void
  participant: OccurrenceThreadParticipant
  /** O menu de mensagem do SDK (copiar, selecionar) com as opções do painel: encaminhar e baixar. */
  messageMenu?: ParticipantMessageMenuOptions
  status: 'closed' | 'open'
  title: string
}>

/**
 * Spec 263 D10 + a conversa da ocorrência: o fio das abas Contratante e Motorista é o `ConversationThread` do SDK na
 * visão do escritório — o mesmo desenho do app do motorista e da conversa por assunto. Mensagem minha é a que o
 * operador escreveu (`outbound`); o canal vai no nome; o envio, o áudio e as respostas rápidas são do SDK. O cabeçalho
 * leva "Ver detalhes" (spec 279 T6c, RF13): o detalhe da ocorrência sem sair da conversa.
 */
export function OccurrenceThread({
  closedNotice,
  companyId,
  counterpartLabel,
  counterpartName = '',
  headerActions,
  occurrenceId,
  onSendError,
  participant,
  messageMenu,
  status,
  title,
}: OccurrenceThreadProps) {
  const { i18n, t } = useTranslation('subjectConversation')
  const { t: tOccurrence } = useTranslation('occurrenceConversation')
  const { api, speakerOf, threadQuickReplies, threadSubject } = useOccurrenceThread({
    ...(companyId === undefined ? {} : { companyId }),
    occurrenceId,
    ...(onSendError === undefined ? {} : { onSendError }),
    participant,
  })
  const labels = {
    ...buildSubjectThreadLabels((key) => t(key), closedNotice),
    ...(participant === 'contractor' ? buildContractorThreadLabels((key) => tOccurrence(key)) : {}),
  }

  return (
    <div className={`${styles.frame} ${participantToneClass(participant)}`}>
      <ConversationThread
        api={api}
        audioRecording={SUBJECT_AUDIO_RECORDING_OPTIONS}
        renderAuthorAvatar={(author) => {
          const speaker = speakerOf(author.name)
          return (
            <ParticipantAvatar
              initials={speaker === 'driver' ? initialsOf(counterpartName) : ''}
              participant={speaker}
            />
          )
        }}
        channels={[...THREAD_CHANNELS[participant]]}
        className={subjectStyles.conversationTheme ?? ''}
        counterpartLabel={counterpartLabel}
        headerActions={
          <>
            {headerActions}
            <OccurrenceDetailsAction
              {...(companyId === undefined ? {} : { companyId })}
              occurrenceId={occurrenceId}
            />
          </>
        }
        labels={labels}
        locale={i18n.language}
        perspective="operator"
        quickReplies={threadQuickReplies}
        {...(messageMenu === undefined ? {} : { messageMenu })}
        status={status}
        subject={threadSubject}
        title={title}
      />
    </div>
  )
}
