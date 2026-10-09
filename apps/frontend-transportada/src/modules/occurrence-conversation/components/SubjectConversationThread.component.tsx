/* Copyright (c) 2026 Ada Technology. MIT License. */
import { DateDivider } from '@adatechnology/conversations-ui'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import {
  countNewIncomingMessages,
  groupConversationByDay,
} from '../shared/occurrenceConversation.service'
import type { OccurrenceConversationMessage } from '../shared/occurrenceConversation.types'
import styles from '../styles/occurrenceConversation.module.css'
import { ConversationMessage } from './ConversationMessage.component'

/** A chave do dia no fuso de quem vê: `en-CA` escreve `AAAA-MM-DD`. */
const dayKeyFormatter = new Intl.DateTimeFormat('en-CA', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function dayKey(iso: string): string {
  const moment = new Date(iso)
  return Number.isNaN(moment.getTime()) ? iso.slice(0, 10) : dayKeyFormatter.format(moment)
}

/**
 * Spec 260 T3.2: o fio da conversa de nota e de viagem. Mesmo balão (`ConversationMessage`), mesmo
 * agrupamento por dia e mesmo anúncio de mensagem nova da conversa de ocorrência — só que a mensagem já
 * chega no formato da 183, e não há contato a adicionar nem reenvio por outro canal (só o app).
 */
export function SubjectConversationThread({
  messages,
}: Readonly<{ messages: readonly OccurrenceConversationMessage[] }>) {
  const { t } = useTranslation('subjectConversation')
  const [announcement, setAnnouncement] = useState('')
  const previousIds = useRef<null | readonly string[]>(null)

  /** A leitura que traz mensagem nova do motorista a anuncia; a primeira, não. */
  useEffect(() => {
    const count = countNewIncomingMessages(previousIds.current, messages)
    previousIds.current = messages.map((message) => message.id)
    if (count > 0) setAnnouncement(t('thread.newMessages', { count }))
  }, [messages, t])

  return (
    <div className={styles.thread}>
      <p aria-live="polite" className={styles.srOnly}>
        {announcement}
      </p>
      {groupConversationByDay(messages, dayKey).map((group) => (
        <section aria-label={group.day} className={styles.daySection} key={group.day}>
          <DateDivider
            classNames={{ label: styles.dayLabel ?? '', root: styles.dayDivider ?? '' }}
            iso={group.messages[0]?.createdAt ?? group.day}
          />
          {group.messages.map((message) => (
            <ConversationMessage canManageContacts={false} key={message.id} message={message} />
          ))}
        </section>
      ))}
    </div>
  )
}
