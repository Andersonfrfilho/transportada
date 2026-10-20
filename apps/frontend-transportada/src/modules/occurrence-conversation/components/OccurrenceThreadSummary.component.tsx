/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import type { OccurrenceConversationMessage } from '../shared/occurrenceConversation.types'
import { summarizeOccurrenceThread } from '../shared/occurrenceThreadSummary.service'
import styles from '../styles/occurrenceThread.module.css'

type OccurrenceThreadSummaryProps = Readonly<{
  counterpartLabel: string
  messages: readonly OccurrenceConversationMessage[]
}>

/**
 * O resumo recolhível no topo de cada conversa: quantas mensagens, de quem foi a última, arquivos e falhas de envio.
 * Fica fora da moldura de altura fixa do fio, então abrir ou fechar não mexe na rolagem das mensagens.
 */
export function OccurrenceThreadSummary({
  counterpartLabel,
  messages,
}: OccurrenceThreadSummaryProps) {
  const { i18n, t } = useTranslation('occurrenceConversation')
  const [isOpen, setOpen] = useState(true)
  const bodyId = useId()
  if (messages.length === 0) return null
  const summary = summarizeOccurrenceThread(messages)
  const lastWhen =
    summary.lastAt === null
      ? ''
      : new Intl.DateTimeFormat(i18n.language, { dateStyle: 'short', timeStyle: 'short' }).format(
          new Date(summary.lastAt),
        )
  const lastBy = summary.lastDirection === 'outbound' ? t('thread.summary.byUs') : counterpartLabel

  return (
    <section aria-label={t('thread.summary.title')} className={styles.summary}>
      <button
        aria-controls={bodyId}
        aria-expanded={isOpen}
        className={styles.summaryToggle}
        onClick={() => setOpen((open) => !open)}
        type="button"
      >
        <Icon name={isOpen ? 'chevron-down' : 'chevron-right'} size="sm" />
        {t('thread.summary.title')}
        <span className={styles.hint}>{t('thread.summary.count', { count: summary.total })}</span>
      </button>
      {isOpen ? (
        <dl className={styles.summaryBody} id={bodyId}>
          <div>
            <dt>{t('thread.summary.last')}</dt>
            <dd>
              {lastBy} · {lastWhen}
            </dd>
          </div>
          <div>
            <dt>{t('thread.summary.exchange')}</dt>
            <dd>
              {t('thread.summary.sent', { count: summary.outbound })} ·{' '}
              {t('thread.summary.received', { count: summary.inbound })}
            </dd>
          </div>
          {summary.attachments > 0 ? (
            <div>
              <dt>{t('thread.summary.files')}</dt>
              <dd>{summary.attachments}</dd>
            </div>
          ) : null}
          {summary.failed > 0 ? (
            <div>
              <dt>{t('thread.summary.failed')}</dt>
              <dd className={styles.error}>{summary.failed}</dd>
            </div>
          ) : null}
          {summary.lastPreview === '' ? null : (
            <div className={styles.summaryPreview}>
              <dt>{t('thread.summary.preview')}</dt>
              <dd>{summary.lastPreview}</dd>
            </div>
          )}
        </dl>
      ) : null}
    </section>
  )
}
