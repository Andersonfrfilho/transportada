/* Copyright (c) 2026 Ada Technology. MIT License. */
import { ChannelIcon, StatusTicks } from '@adatechnology/conversations-ui'

import styles from '../styles/occurrenceDetails.module.css'

type ClientDeliveryTicksProps = Readonly<{
  channel: 'email' | 'whatsapp'
  state: 'failed' | 'queued' | 'sent'
  stateLabel: string
}>

/** Spec 286 T5 (RF4b): o canal e o tique do envio ao cliente são os do SDK de conversas, os mesmos do painel. */
export function ClientDeliveryTicks({ channel, state, stateLabel }: ClientDeliveryTicksProps) {
  return (
    <span className={styles.ticks}>
      <ChannelIcon channel={channel} />
      <StatusTicks appearance="stylesheet" status={state} title={stateLabel} />
    </span>
  )
}
