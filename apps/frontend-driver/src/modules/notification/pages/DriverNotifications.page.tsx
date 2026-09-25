/* Copyright (c) 2026 Ada Technology. MIT License. */
/**
 * A tela que o sino abre (plan D4). Fora do módulo `driver-trip` de propósito: o sino não é
 * "código de outra app" (ADR-0075 §7) — `@adatechnology/notification-ui` é pacote publicado, e o
 * app só cola o token nele. `NotificationList` não pede prop nenhuma: lê do `NotificationProvider`
 * que a casca (`main.tsx`) já monta em volta de tudo.
 */
import { NotificationList } from '@adatechnology/notification-ui'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { navigateToDriverSection } from '@/modules/shared/driverRoute.service'

import styles from '../../driver-trip/styles/driverTrip.module.css'

export function DriverNotificationsPage() {
  const { t } = useTranslation('driverTrip')

  return (
    <main className={styles.shell}>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          window.history.back()
        }}
      >
        <Icon name="close" />
        {t('nav.trip')}
      </Button>
      <h1 className={styles.profileName}>{t('nav.notifications')}</h1>
      <NotificationList
        onSelect={() => {
          navigateToDriverSection('notifications')
        }}
      />
    </main>
  )
}
