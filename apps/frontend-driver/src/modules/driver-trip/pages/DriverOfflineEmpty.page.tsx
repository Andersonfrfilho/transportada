/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import styles from '../styles/driverTrip.module.css'

/**
 * Boot sem rede e sem snapshot válido (plan D4, `offline-empty`): nada a mostrar da viagem, e a
 * tela diz isso em vez de esperar um login que não tem como acontecer. A autenticação volta sozinha
 * quando o Keycloak responder.
 */
export function DriverOfflineEmptyPage() {
  const { t } = useTranslation('driverTrip')

  return (
    <main className={styles.shell}>
      <h1>{t('offline.emptyTitle')}</h1>
      <p className={styles.queueBanner} role="status">
        {t('offline.empty')}
      </p>
    </main>
  )
}
