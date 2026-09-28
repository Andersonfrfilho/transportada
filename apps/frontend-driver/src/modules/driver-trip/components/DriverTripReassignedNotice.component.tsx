/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import styles from '../styles/driverTrip.module.css'

type DriverTripReassignedNoticeProps = Readonly<{
  onDismiss: () => void
}>

/** Spec 217 (RF8, D6): um texto só serve para reatribuição e para a viagem devolvida a draft. */
export function DriverTripReassignedNotice({ onDismiss }: DriverTripReassignedNoticeProps) {
  const { t } = useTranslation('driverTrip')

  return (
    <section className={styles.rejectedBanner} role="status">
      <p className={styles.profileMeta}>{t('reassignedTrip.notice')}</p>
      <div className={styles.actions}>
        <Button type="button" variant="secondary" onClick={onDismiss}>
          <Icon name="check" />
          {t('reassignedTrip.dismiss')}
        </Button>
      </div>
    </section>
  )
}
