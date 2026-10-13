/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { useContractorReplyEmailOptionsQuery } from '../queries/contractorReplyEmail.query'
import styles from '../styles/occurrenceConversation.module.css'

const KNOWN_REASONS = [
  'attachment_too_large_for_email',
  'note_without_recipient_email',
  'send_failed',
] as const

/**
 * Spec 248 RF13 (T4.7): "Enviado ao cliente por e-mail" / "Enviado a e-mail informado" na linha do tempo do
 * retorno — cada envio com o endereço só mascarado, o estado e, quando não saiu, o motivo.
 */
export function ContractorReplyEmailHistory({ occurrenceId }: Readonly<{ occurrenceId: string }>) {
  const { t, i18n } = useTranslation('occurrenceConversation')
  const options = useContractorReplyEmailOptionsQuery({ enabled: true, occurrenceId }).data
  if (options === null || options === undefined || options.deliveries.length === 0) return null
  const formatter = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'short',
    timeStyle: 'short',
  })
  return (
    <section aria-label={t('replyEmail.history.title')} className={styles.replyEmailHistory}>
      <h4 className={styles.replyEmailHistoryTitle}>{t('replyEmail.history.title')}</h4>
      <ul className={styles.replyEmailHistoryList}>
        {options.deliveries.map((delivery) => {
          const reason = KNOWN_REASONS.find((known) => known === delivery.reason)
          const when = new Date(delivery.createdAt)
          return (
            <li key={delivery.id}>
              <strong>{t(`replyEmail.history.target.${delivery.target}`)}</strong>
              {delivery.addressMasked === null ? null : ` · ${delivery.addressMasked}`}
              {` · ${t(`replyEmail.history.status.${delivery.status}`)}`}
              {reason === undefined ? null : ` (${t(`replyEmail.outcome.${reason}`)})`}
              {Number.isNaN(when.getTime()) ? null : ` · ${formatter.format(when)}`}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
