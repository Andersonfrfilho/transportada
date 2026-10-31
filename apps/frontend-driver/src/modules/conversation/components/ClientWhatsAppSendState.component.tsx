/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useClientBoletoWhatsAppSend } from '@/modules/client-whatsapp/hooks/useClientBoletoWhatsAppSend.hook'
import type { ClientBoletoWhatsAppDelivery } from '@/modules/client-whatsapp/shared/clientBoletoWhatsApp.types'
import { formatActivityTime } from '@/modules/driver-trip/shared/documentActivity.service'

import { useIsOnline } from '../hooks/useIsOnline.hook'
import styles from '../styles/occurrenceDetails.module.css'
import { ClientDeliveryTicks } from './ClientDeliveryTicks.component'

type ClientWhatsAppSendStateProps = Readonly<{
  deliveries: readonly ClientBoletoWhatsAppDelivery[]
  occurrenceId: string
}>

/** Número sem WhatsApp e boleto grande demais falhariam igual na segunda tentativa. */
const NOT_RESENDABLE_REASONS: readonly (null | string)[] = [
  'attachment_too_large_for_whatsapp',
  'whatsapp_number_not_found',
]

/** Uma linha por número, com a última tentativa; a recusada fica no histórico do escritório. */
function latestPerNumber(
  deliveries: readonly ClientBoletoWhatsAppDelivery[],
): readonly ClientBoletoWhatsAppDelivery[] {
  const latest = new Map<string, ClientBoletoWhatsAppDelivery>()
  for (const delivery of deliveries) {
    if (delivery.numberMasked === null) continue
    const current = latest.get(delivery.numberMasked)
    if (current === undefined || delivery.createdAt > current.createdAt) {
      latest.set(delivery.numberMasked, delivery)
    }
  }
  return [...latest.values()].toSorted((first, second) =>
    first.createdAt.localeCompare(second.createdAt),
  )
}

/**
 * Spec 286 T5 (RF4b): o estado do boleto por WhatsApp na folha de detalhes — por número, o canal e o tique do SDK,
 * o motivo quando não saiu e **Reenviar** (a rota de reenvio da 281, com chave nova por toque e só com sinal).
 */
export function ClientWhatsAppSendState({
  deliveries,
  occurrenceId,
}: ClientWhatsAppSendStateProps) {
  const { t } = useTranslation('conversation')
  const { t: tWhatsApp } = useTranslation('clientWhatsApp')
  const isOnline = useIsOnline()
  const { resend, status } = useClientBoletoWhatsAppSend({ isOnline, occurrenceId })
  const items = latestPerNumber(deliveries)
  if (items.length === 0) return null

  return (
    <>
      <ul className={styles.list}>
        {items.map((delivery) => (
          <li key={delivery.id}>
            <span>{delivery.numberMasked}</span>
            <span className={styles.labelNote}>
              <ClientDeliveryTicks
                channel="whatsapp"
                state={delivery.status}
                stateLabel={t(`details.sendState.state.${delivery.status}`)}
              />{' '}
              {t(`details.sendState.state.${delivery.status}`)}
              {delivery.sentAt === null ? '' : ` · ${formatActivityTime(delivery.sentAt)}`}
              {delivery.status === 'failed'
                ? ` — ${tWhatsApp(`reason.${delivery.reason ?? 'send_failed'}`)}`
                : ''}
            </span>
            {delivery.status === 'queued' ||
            (delivery.status === 'failed' &&
              NOT_RESENDABLE_REASONS.includes(delivery.reason)) ? null : (
              <Button
                disabled={status.kind === 'sending' || !isOnline}
                onClick={() => void resend(delivery.id)}
                type="button"
                variant="secondary"
              >
                {status.kind === 'sending'
                  ? t('details.sendState.resending')
                  : t('details.sendState.resend')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {status.kind === 'error' ? (
        <p className={styles.hint} role="alert">
          {tWhatsApp(`error.${status.errorKey}`)}
        </p>
      ) : null}
    </>
  )
}
