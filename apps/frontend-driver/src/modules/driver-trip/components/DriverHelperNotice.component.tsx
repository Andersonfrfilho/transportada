/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import styles from '../styles/driverTrip.module.css'

/** Spec 243 RF-3: o ajudante lê a viagem; o aviso diz por que as ações do motorista não estão ali. */
export function DriverHelperNotice() {
  const { t } = useTranslation('driverTrip')

  return (
    <section className={styles.helperNotice} role="status">
      <p className={styles.helperNoticeTitle}>
        <Icon aria-hidden="true" name="workspace-driver-trip" size="sm" />
        {t('helperNotice.title')}
      </p>
      <p className={styles.helperNoticeDetail}>{t('helperNotice.detail')}</p>
    </section>
  )
}
