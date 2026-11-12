/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { NextStopOffer } from '../shared/fieldReportResponse.service'
import styles from '../styles/driverTrip.module.css'

type DriverNextStopCardProps = Readonly<{
  nextStop: NextStopOffer
  onDismiss: () => void
  onStartRoute: (stopId: string) => void
}>

/** Spec 294 RF11/RF12: a próxima parada depois de fechar a atual, com "Iniciar rota" em destaque. */
export function DriverNextStopCard({ nextStop, onDismiss, onStartRoute }: DriverNextStopCardProps) {
  const { t } = useTranslation('driverTrip')

  return (
    <section aria-label={t('nextStop.title', nextStop)} className={styles.rejectedBanner}>
      <h3>
        {t('nextStop.title', { sequence: nextStop.sequence, totalStops: nextStop.totalStops })}
      </h3>
      <p className={styles.profileMeta}>
        {nextStop.recipientName}
        {nextStop.address === '' ? '' : ` · ${nextStop.address}`}
      </p>
      {nextStop.documentNumbers.length === 0 ? null : (
        <p className={styles.profileMeta}>
          {t('nextStop.documents', { numbers: nextStop.documentNumbers.join(', ') })}
        </p>
      )}
      {nextStop.isAddressReliable ? null : (
        <p className={styles.proofPendingWarningLead} role="status">
          {t('nextStop.unreliableAddress')}
        </p>
      )}
      <div className={styles.actions}>
        <Button onClick={() => onStartRoute(nextStop.id)} type="button">
          <Icon name="check" />
          {t('nextStop.start')}
        </Button>
        <Button onClick={onDismiss} type="button" variant="ghost">
          {t('nextStop.notNow')}
        </Button>
      </div>
    </section>
  )
}
