/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { CanhotoDuplicateNotice } from '../shared/canhotoDuplicateNotice.service'
import { formatActivityTime } from '../shared/documentActivity.service'
import styles from '../styles/driverTrip.module.css'

type DriverCanhotoDuplicateNoticeProps = Readonly<{
  notice: CanhotoDuplicateNotice
  onDismiss: () => void
}>

/** Spec 294 RF26: "Esse canhoto já tinha chegado" — a mesma imagem não grava duas vezes. */
export function DriverCanhotoDuplicateNotice({
  notice,
  onDismiss,
}: DriverCanhotoDuplicateNoticeProps) {
  const { t } = useTranslation('driverTrip')

  return (
    <section className={styles.rejectedBanner} role="status">
      <p className={styles.profileMeta}>
        {t('canhotoDuplicate.notice', { time: formatActivityTime(notice.attachedAt) })}
      </p>
      <div className={styles.actions}>
        <Button onClick={onDismiss} type="button" variant="secondary">
          <Icon name="check" />
          {t('canhotoDuplicate.dismiss')}
        </Button>
      </div>
    </section>
  )
}
