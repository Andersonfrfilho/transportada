/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { formatActivityTime } from '@/modules/driver-trip/shared/documentActivity.service'

import type { DriverClientEmailDelivery } from '../shared/driverClientEmails.service'
import styles from '../styles/occurrenceDetails.module.css'
import { ClientDeliveryTicks } from './ClientDeliveryTicks.component'

type ClientEmailSendStateProps = Readonly<{ deliveries: readonly DriverClientEmailDelivery[] }>

/**
 * Spec 279 T6b (RF12): por endereço, **Enviado** (com a hora), **Na fila** ou **Falhou**; o envio automático sem
 * e-mail do cliente (T3c) vira uma linha sem endereço. Só leitura: o "Tentar de novo" é do escritório.
 */
export function ClientEmailSendState({ deliveries }: ClientEmailSendStateProps) {
  const { t } = useTranslation('conversation')
  return (
    <ul className={styles.list}>
      {deliveries.map((delivery) => (
        <li key={delivery.id}>
          <span>{delivery.address ?? t('details.sendState.clientWithoutEmail')}</span>
          {delivery.status === 'skipped' ? null : (
            <span className={styles.labelNote}>
              <ClientDeliveryTicks
                channel="email"
                state={delivery.status}
                stateLabel={t(`details.sendState.state.${delivery.status}`)}
              />{' '}
              {t(`details.sendState.state.${delivery.status}`)}
              {delivery.sentAt === null ? '' : ` · ${formatActivityTime(delivery.sentAt)}`}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}
