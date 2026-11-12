/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { OccurrenceConversation } from '../shared/occurrenceConversation.types'
import styles from '../styles/clientConversation.module.css'
import threadStyles from '../styles/occurrenceThread.module.css'
import { ClientChannelsStrip } from './ClientChannelsStrip.component'
import { ParticipantBadge, participantToneClass } from './ParticipantBadge.component'

/**
 * Spec 283 D7: a conversa do cliente em tela média (64–80 rem), onde três colunas ficariam apertadas. Recolhida, mostra
 * o crachá, os canais abertos e as não lidas; o botão abre o fio. O corpo fica montado (`hidden`), como nas colunas.
 */
export function ClientConversationStrip({
  children,
  conversation,
  isOpen,
  onToggle,
  unreadCount,
}: Readonly<{
  children: ReactNode
  conversation: OccurrenceConversation
  isOpen: boolean
  onToggle: () => void
  unreadCount: number
}>) {
  const { t } = useTranslation('occurrenceConversation')
  const bodyId = useId()
  return (
    <section className={`${styles.strip} ${participantToneClass('client')}`}>
      <header className={styles.stripHeader}>
        <ParticipantBadge participant="client" />
        <ClientChannelsStrip channels={conversation.client?.channels ?? []} />
        {unreadCount > 0 ? (
          <span className={`${threadStyles.unread} ${styles.unread}`}>
            {t('client.unread', { count: unreadCount })}
          </span>
        ) : null}
        <Button
          aria-controls={bodyId}
          aria-expanded={isOpen}
          onClick={onToggle}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name={isOpen ? 'chevron-up' : 'chevron-down'} size="sm" />
          {isOpen ? t('client.close') : t('client.open')}
        </Button>
      </header>
      <div hidden={!isOpen} id={bodyId}>
        {children}
      </div>
    </section>
  )
}
