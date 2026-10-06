/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import type { CargoArrivalSummary } from '../shared/cargoArrival.types'
import styles from '../styles/cargoReceiving.module.css'
import detailStyles from '../styles/cargoDetail.module.css'
import { CargoOverdueBadge, CargoStatusBadge } from './CargoArrivalBadges.component'
import { CargoArrivalProgress } from './CargoArrivalProgress.component'

type CargoArrivalDetailHeaderProps = Readonly<{
  arrival: CargoArrivalSummary
  onOpenList: () => void
  onOpenSeparation: () => void
}>

/** Quem chegou, quando, até quando separar e quanto já foi separado. */
export function CargoArrivalDetailHeader({
  arrival,
  onOpenList,
  onOpenSeparation,
}: CargoArrivalDetailHeaderProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const formatMoment = useMomentFormatter()

  return (
    <header className={styles.header}>
      <div className={styles.backRow}>
        <Button onClick={onOpenList} type="button" variant="ghost">
          <Icon name="chevron-left" />
          {t('detail.back')}
        </Button>
        <Button onClick={onOpenSeparation} type="button" variant="secondary">
          <Icon name="truck" />
          {t('detail.openSeparation')}
        </Button>
      </div>
      <p className={styles.kicker}>{t('eyebrow')}</p>
      <h1>{t('detail.title', { name: arrival.contractorName })}</h1>
      <div className={detailStyles.groupSummary}>
        <CargoStatusBadge status={arrival.status} />
        {arrival.isSeparationOverdue ? <CargoOverdueBadge /> : null}
      </div>
      <ul className={detailStyles.facts}>
        <li>{t('facts.arrivedAt', { date: formatMoment(arrival.arrivedAt) })}</li>
        <li>
          {arrival.separationDueAt === null
            ? t('facts.noDueAt')
            : t('facts.dueAt', { date: formatMoment(arrival.separationDueAt) })}
        </li>
        {arrival.reference === null ? null : (
          <li>{t('facts.reference', { reference: arrival.reference })}</li>
        )}
        {arrival.palletCount === null ? null : (
          <li>{t('facts.pallets', { count: arrival.palletCount })}</li>
        )}
      </ul>
      <CargoArrivalProgress counts={arrival.counts} />
    </header>
  )
}
