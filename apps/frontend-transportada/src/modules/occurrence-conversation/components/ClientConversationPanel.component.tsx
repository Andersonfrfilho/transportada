/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import { CHANNEL_ICONS } from '../shared/conversationParticipant.constant'
import type {
  OccurrenceConversation,
  OccurrenceConversationMessage,
} from '../shared/occurrenceConversation.types'
import styles from '../styles/clientConversation.module.css'
import { ClientChannelsStrip } from './ClientChannelsStrip.component'

function ClientMessage({ message }: Readonly<{ message: OccurrenceConversationMessage }>) {
  const { i18n, t } = useTranslation('occurrenceConversation')
  const when = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(message.createdAt))
  if (message.systemNotice !== undefined) {
    return <li className={styles.system}>{message.bodyText}</li>
  }
  const outbound = message.direction === 'outbound'
  const delivery = message.clientDelivery
  const author =
    message.author.kind === 'client'
      ? message.author.addressMasked
      : delivery === undefined
        ? t('client.fromUs')
        : (delivery.actorName ?? t('client.bySystem'))
  const body =
    message.bodyText.trim() !== ''
      ? message.bodyText
      : delivery?.documentName == null
        ? t('client.sentNoText')
        : t('client.sentDocument', { name: delivery.documentName })
  return (
    <li className={`${styles.message} ${outbound ? styles.out : styles.in}`}>
      <span className={styles.who}>
        <Icon name={CHANNEL_ICONS[message.channel]} size="sm" />
        {t(`channel.${message.channel === 'whatsapp' ? 'whatsapp' : 'email'}`)}
        {' · '}
        {author}
        {delivery === undefined ? '' : ` → ${delivery.recipientMasked}`}
      </span>
      <span>{body}</span>
      <span className={styles.meta}>
        {when}
        {message.status === null ? '' : ` · ${t(`client.messageStatus.${message.status}`)}`}
      </span>
    </li>
  )
}

/**
 * Spec 283 D2/D4: a conversa do cliente na ocorrência — canais abertos no topo e os envios e respostas abaixo.
 * Nesta etapa é só leitura (responder pelo painel é a T5); nasce quando houve o primeiro envio ao cliente (D3).
 */
export function ClientConversationPanel({
  conversation,
  hideChannels = false,
}: Readonly<{
  conversation: OccurrenceConversation
  /** A faixa recolhida já mostra os canais no cabeçalho. */
  hideChannels?: boolean
}>) {
  const { t } = useTranslation('occurrenceConversation')
  return (
    <div className={styles.panel}>
      {hideChannels ? null : <ClientChannelsStrip channels={conversation.client?.channels ?? []} />}
      {conversation.messages.length === 0 ? (
        <p className={styles.hint}>{t('client.empty')}</p>
      ) : (
        <ol aria-label={t('client.thread')} className={styles.thread}>
          {conversation.messages.map((message) => (
            <ClientMessage key={message.id} message={message} />
          ))}
        </ol>
      )}
    </div>
  )
}
