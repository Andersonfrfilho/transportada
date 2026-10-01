/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import styles from '../styles/driverTrip.module.css'

type DriverTripAutoSwitchNoticeProps = Readonly<{
  onDismiss: () => void
  path: string
}>

/**
 * A viagem exibida trocou sozinha (fallback de `resolveSelectedTrip`, RF12) — sem isto o motorista
 * via "Iniciar rota" reaparecer e achava que era a viagem que ele acabara de concluir.
 */
export function DriverTripAutoSwitchNotice({ onDismiss, path }: DriverTripAutoSwitchNoticeProps) {
  const { t } = useTranslation('driverTrip')

  return (
    <section className={styles.rejectedBanner} role="status">
      <p className={styles.profileMeta}>{t('tripSelector.autoSwitched.notice', { path })}</p>
      <div className={styles.actions}>
        <Button type="button" variant="secondary" onClick={onDismiss}>
          <Icon name="check" />
          {t('tripSelector.autoSwitched.dismiss')}
        </Button>
      </div>
    </section>
  )
}
