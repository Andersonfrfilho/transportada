/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import { clientChannelKey, clientChannelTone } from '../shared/clientConversation.service'
import { CHANNEL_ICONS } from '../shared/conversationParticipant.constant'
import type { OccurrenceClientChannel } from '../shared/occurrenceConversation.types'
import styles from '../styles/clientConversation.module.css'

/** Spec 283 D4: os canais abertos com o cliente — ícone + palavra + destino mascarado + estado, nunca só a cor. */
export function ClientChannelsStrip({
  channels,
}: Readonly<{ channels: readonly OccurrenceClientChannel[] }>) {
  const { t } = useTranslation('occurrenceConversation')
  if (channels.length === 0) return null
  return (
    <ul aria-label={t('client.channels')} className={styles.channels}>
      {channels.map((channel) => (
        <li
          className={`${styles.chip} ${styles[`tone_${clientChannelTone(channel.status)}`]}`}
          key={clientChannelKey(channel)}
        >
          <Icon name={CHANNEL_ICONS[channel.kind]} size="sm" />
          <span>{t(`channel.${channel.kind}`)}</span>
          <span className={styles.address}>{channel.maskedAddress}</span>
          <span className={styles.state}>{t(`client.status.${channel.status}`)}</span>
        </li>
      ))}
    </ul>
  )
}
