/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import { describeConversationMessage } from '../shared/occurrenceConversation.service'
import type {
  ContractorSenderSuggestion,
  OccurrenceConversationMessage,
} from '../shared/occurrenceConversation.types'
import styles from '../styles/occurrenceThread.module.css'

type UnknownSender = Readonly<{
  arrivedAs: string
  name: string
  suggestion: ContractorSenderSuggestion
  unverified: boolean
}>

type OccurrenceThreadSendersProps = Readonly<{
  canManageContacts: boolean
  messages: readonly OccurrenceConversationMessage[]
  /** Spec 183 T903 (F5): a ação "Adicionar aos contatos" é de `delivery-clients`; aqui só se decide quando oferecê-la. */
  renderAddContact: (suggestion: ContractorSenderSuggestion) => ReactNode
}>

/** Um remetente por endereço: quem escreveu três vezes aparece uma só. */
function collectUnknownSenders(
  messages: readonly OccurrenceConversationMessage[],
): UnknownSender[] {
  const byAddress = new Map<string, UnknownSender>()
  for (const message of messages) {
    const { author } = describeConversationMessage(message)
    if (author.kind !== 'unknown') continue
    byAddress.set(author.arrivedAs, author)
  }
  return [...byAddress.values()]
}

/**
 * A faixa do remetente que o SDK não sabe desenhar: o `From` que não é contato mostra o endereço como chegou e
 * "Remetente não confirmado" (S2, sem DKIM alinhado: não oferece cadastro) ou "Fora dos contatos" com
 * "Adicionar aos contatos". O nome também vai no balão (`authorName`).
 */
export function OccurrenceThreadSenders({
  canManageContacts,
  messages,
  renderAddContact,
}: OccurrenceThreadSendersProps) {
  const { t } = useTranslation('occurrenceConversation')
  const titleId = useId()
  const senders = collectUnknownSenders(messages)
  if (senders.length === 0) return null

  return (
    <section aria-labelledby={titleId} className={`${styles.notice} ${styles.noticeInfo}`}>
      <h4 className={styles.noticeTitle} id={titleId}>
        <Icon name="alert" size="sm" />
        {t('thread.senders.title')}
      </h4>
      <ul className={styles.attachmentList}>
        {senders.map((sender) => (
          <li className={styles.notice} key={sender.arrivedAs}>
            <p className={styles.noticeBody}>
              <strong>{sender.name}</strong>{' '}
              <span className={styles.tag}>
                {sender.unverified ? t('author.unverified') : t('author.outside')}
              </span>
            </p>
            <p className={styles.hint}>
              {t('author.arrivedAs')}: {sender.arrivedAs}
            </p>
            {sender.unverified ? <p className={styles.hint}>{t('author.unverifiedHint')}</p> : null}
            {canManageContacts && !sender.unverified ? (
              <div className={styles.noticeActions}>{renderAddContact(sender.suggestion)}</div>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}
