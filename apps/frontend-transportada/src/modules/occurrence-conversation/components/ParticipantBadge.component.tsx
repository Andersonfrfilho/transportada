/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import {
  PARTICIPANT_APPEARANCE,
  type ConversationParticipant,
} from '../shared/conversationParticipant.constant'
import styles from '../styles/occurrenceThread.module.css'

const TONE_CLASS = {
  contractor: styles.toneContractor,
  driver: styles.toneDriver,
  client: styles.toneClient,
  operator: styles.toneOperator,
} as const

export function participantToneClass(participant: ConversationParticipant): string {
  return TONE_CLASS[PARTICIPANT_APPEARANCE[participant].tone] ?? ''
}

/** Cor + ícone + nome sempre juntos: nunca só a cor. */
export function ParticipantBadge({
  children,
  participant,
}: Readonly<{ children?: ReactNode; participant: ConversationParticipant }>) {
  const { t } = useTranslation('occurrenceConversation')
  return (
    <span className={`${styles.badge} ${participantToneClass(participant)}`}>
      <Icon name={PARTICIPANT_APPEARANCE[participant].icon} size="sm" />
      <span>{t(`participant.${participant}`)}</span>
      {children}
    </span>
  )
}

/**
 * O avatar do balão: círculo na cor do participante com o ícone dele (o nome vai ao lado, no balão). Com `initials`
 * (quem fala não tem foto), o círculo mostra as iniciais no lugar do ícone.
 */
export function ParticipantAvatar({
  initials = '',
  participant,
}: Readonly<{ initials?: string; participant: ConversationParticipant }>) {
  return (
    <span aria-hidden="true" className={`${styles.avatar} ${participantToneClass(participant)}`}>
      {initials === '' ? (
        <Icon name={PARTICIPANT_APPEARANCE[participant].icon} size="sm" />
      ) : (
        initials
      )}
    </span>
  )
}
