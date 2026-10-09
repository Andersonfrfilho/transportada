/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import type { SubjectConversationSummary } from '../shared/subjectConversation.types'
import styles from '../styles/subjectConversation.module.css'
import { SubjectConversationProtocol } from './SubjectConversationProtocol.component'

/** Selos de canal (ícone e texto — a cor nunca fala sozinha) e o estado da conversa. */
export function SubjectConversationTags({
  summary,
}: Readonly<{ summary: SubjectConversationSummary }>) {
  const { t } = useTranslation('subjectConversation')
  return (
    <ul aria-label={t('channel.label')} className={styles.tags}>
      {summary.channels.map((channel) => (
        <li className={styles.tag} key={channel}>
          <Icon name="message" size="sm" />
          {t(`channel.${channel}`)}
        </li>
      ))}
      <li className={summary.status === 'open' ? styles.tag : `${styles.tag} ${styles.tagClosed}`}>
        {t(`status.${summary.status}`)}
      </li>
    </ul>
  )
}

/** O cabeçalho da conversa: assunto, motorista, protocolo, canais e estado. */
export function SubjectConversationHeader({
  summary,
}: Readonly<{ summary: SubjectConversationSummary }>) {
  const { t } = useTranslation('subjectConversation')
  return (
    <header className={styles.header}>
      <h3>{summary.subjectLabel}</h3>
      <p className={styles.driver}>
        {summary.driverName === null
          ? t('panel.noDriverName')
          : t('panel.driver', { name: summary.driverName })}
      </p>
      <SubjectConversationProtocol protocol={summary.protocol} />
      <SubjectConversationTags summary={summary} />
    </header>
  )
}
