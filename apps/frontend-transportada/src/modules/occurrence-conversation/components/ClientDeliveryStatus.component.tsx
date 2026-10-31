/* Copyright (c) 2026 Ada Technology. MIT License. */
import { ChannelIcon, StatusTicks } from '@adatechnology/conversations-ui'
import { useTranslation } from 'react-i18next'

import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import styles from '../styles/occurrenceDetails.module.css'

type ClientDeliveryStatusProps = Readonly<{
  at: string
  channel: 'email' | 'whatsapp'
  /** Spec 286 (RF4): o e-mail saiu como reserva do WhatsApp automático. */
  isWhatsAppFallback?: boolean
  /** Quando ausente (API anterior), a linha não diz quem disparou. */
  trigger?: 'automatic' | 'operator' | undefined
  /** O ticket do SDK: o mesmo que a conversa usa. */
  state: 'failed' | 'queued' | 'sent'
  stateLabel: string
  /** Chave de tradução do bloco (`sendState` ou `whatsappState`) que traz `trigger.*`. */
  triggerScope: 'sendState' | 'whatsappState'
}>

/**
 * Spec 286 T4 (RF4b): o canal e o estado do envio ao cliente com os componentes do SDK de conversas
 * (`ChannelIcon`, `StatusTicks`) — nada de ícone ou tique desenhado aqui — mais a hora e quem disparou.
 */
export function ClientDeliveryStatus({
  at,
  channel,
  isWhatsAppFallback = false,
  state,
  stateLabel,
  trigger,
  triggerScope,
}: ClientDeliveryStatusProps) {
  const { t } = useTranslation('occurrenceConversation')
  const formatMoment = useMomentFormatter()
  return (
    <>
      <ChannelIcon channel={channel} />
      <StatusTicks appearance="stylesheet" status={state} title={stateLabel} />
      <time dateTime={at}>{formatMoment(at)}</time>
      {trigger === undefined ? null : (
        <span className={styles.hint}>{t(`details.${triggerScope}.trigger.${trigger}`)}</span>
      )}
      {isWhatsAppFallback ? (
        <span className={styles.hint}>{t('details.sendState.whatsappFallback')}</span>
      ) : null}
    </>
  )
}
