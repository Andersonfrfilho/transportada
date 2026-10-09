/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { ProgressBar } from '@/components/ui/progress'

import { resolveOccupancyView, type OccupancyMeasureView } from '../shared/tripListCells.service'
import type { TripOccupancySummary } from '../shared/trip.types'
import styles from '../styles/tripListCells.module.css'

type TripOccupancyBarsProps = Readonly<{
  hasVehicle: boolean
  occupancy: TripOccupancySummary | null | undefined
}>

type MeasureKind = 'volume' | 'weight'

type OccupancyMeasureProps = Readonly<{
  kind: MeasureKind
  measure: OccupancyMeasureView
}>

function OccupancyMeasure({ kind, measure }: OccupancyMeasureProps) {
  const { t } = useTranslation('trip')

  if (measure.kind === 'missing') {
    const missingKey =
      kind === 'weight' || measure.reason === null
        ? `listCells.occupancy.${kind}Missing`
        : `listCells.occupancy.missingReason.${measure.reason}`

    return (
      <p className={styles.measureMissing}>
        <span className={styles.measureLabel}>{t(`listCells.occupancy.${kind}`)}</span>{' '}
        {t(missingKey)}
      </p>
    )
  }

  const markText =
    measure.mark === null ? '' : ` · ${t(`listCells.occupancy.mark.${measure.mark}`)}`
  const valueText = `${t(`listCells.occupancy.${kind}`)} ${measure.percent}%${markText}`

  return (
    <div className={styles.measure}>
      <ProgressBar
        completed={measure.ratio}
        label={t(`listCells.occupancy.${kind}`)}
        total={1}
        valueText={valueText}
      />
    </div>
  )
}

export function TripOccupancyBars({ hasVehicle, occupancy }: TripOccupancyBarsProps) {
  const { t } = useTranslation('trip')
  const view = resolveOccupancyView({ hasVehicle, occupancy })

  if (view.kind === 'noVehicle') {
    return <span className={styles.unknown}>{t('listCells.occupancy.noVehicle')}</span>
  }
  if (view.kind === 'unknown') {
    return <span className={styles.unknown}>{t('table.noAmount')}</span>
  }

  return (
    <div aria-label={t('listCells.occupancy.group')} className={styles.occupancy} role="group">
      <OccupancyMeasure kind="weight" measure={view.weight} />
      <OccupancyMeasure kind="volume" measure={view.volume} />
    </div>
  )
}
