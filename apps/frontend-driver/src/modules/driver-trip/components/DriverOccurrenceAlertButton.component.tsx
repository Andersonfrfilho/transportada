/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { navigateToDriverSection } from '@/modules/shared/driverRoute.service'

import { formatQueueBadge } from '../shared/pendingQueue.service'
import styles from '../styles/driverTrip.module.css'

type DriverOccurrenceAlertButtonProps = Readonly<{
  /** As ocorrências em aberto da viagem (fila, recusadas e abertas do servidor). */
  count: number
}>

/** Spec 266 RF2: zero não ocupa lugar no cabeçalho; com alguma em aberto, o toque abre a lista. */
export function DriverOccurrenceAlertButton({ count }: DriverOccurrenceAlertButtonProps) {
  const { t } = useTranslation('driverTrip')
  if (count <= 0) return null

  return (
    <button
      aria-label={t('routeOccurrence.alert.label', { count })}
      className={styles.occurrenceAlertButton}
      type="button"
      onClick={() => navigateToDriverSection('occurrences')}
    >
      <Icon name="alert" />
      <span aria-hidden="true" className={styles.occurrenceAlertBadge}>
        {formatQueueBadge(count)}
      </span>
    </button>
  )
}
