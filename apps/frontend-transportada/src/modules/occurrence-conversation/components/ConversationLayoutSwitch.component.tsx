/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { ConversationParticipant } from '../shared/conversationParticipant.constant'
import {
  CONVERSATION_LAYOUT_MODES,
  type ConversationLayoutMode,
} from '../shared/occurrenceConversationLayout.service'
import styles from '../styles/occurrenceThread.module.css'
import { ParticipantBadge, participantToneClass } from './ParticipantBadge.component'

const LAYOUT_ICONS = { 'side-by-side': 'columns', tabs: 'clipboard-list' } as const

/** O operador escolhe como ver as conversas; o seletor fica sempre à vista, com ícone + palavra. */
export function ConversationLayoutSwitch({
  layout,
  onChange,
}: Readonly<{ layout: ConversationLayoutMode; onChange: (mode: ConversationLayoutMode) => void }>) {
  const { t } = useTranslation('occurrenceConversation')
  const labels = { 'side-by-side': t('layout.sideBySide'), tabs: t('layout.tabs') } as const
  return (
    <div aria-label={t('layout.label')} className={styles.layoutSwitch} role="group">
      {CONVERSATION_LAYOUT_MODES.map((mode) => (
        <Button
          aria-pressed={layout === mode}
          key={mode}
          onClick={() => onChange(mode)}
          size="sm"
          type="button"
          variant={layout === mode ? 'default' : 'secondary'}
        >
          <Icon name={LAYOUT_ICONS[mode]} size="sm" />
          {labels[mode]}
        </Button>
      ))}
    </div>
  )
}

/** A coluna do modo lado a lado: cabeçalho com o participante (ícone + cor + nome) e as não lidas. */
export function ConversationColumn({
  children,
  participant,
  unreadCount,
}: Readonly<{
  children: ReactNode
  participant: ConversationParticipant
  unreadCount: number
}>) {
  const { t } = useTranslation('occurrenceConversation')
  return (
    <section className={`${styles.column} ${participantToneClass(participant)}`}>
      <header className={styles.columnHeader}>
        <ParticipantBadge participant={participant} />
        {unreadCount > 0 ? (
          <span className={styles.unread}>{t('thread.unread', { count: unreadCount })}</span>
        ) : null}
      </header>
      {children}
    </section>
  )
}
