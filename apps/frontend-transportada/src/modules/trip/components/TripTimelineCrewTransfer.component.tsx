/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import tripStyles from '../styles/trip.module.css'
import styles from '../styles/tripTimeline.module.css'
import type { TripTimelineCrewTransferText } from '../shared/tripTimelineCrewTransfer.service'

type TripTimelineCrewTransferProps = Readonly<{ view: TripTimelineCrewTransferText }>

/**
 * Spec 249 RF4: o que o evento diz além do título — quem saiu e quem entrou por papel, o motivo, a
 * diferença de custo (só com `trip.financials`) e o aviso de que o MDF-e autorizado não muda.
 */
export function TripTimelineCrewTransfer({ view }: TripTimelineCrewTransferProps) {
  const { t } = useTranslation('trip')
  const lineClassName = cn(styles.itemDetail, styles.itemAddressChange)

  return (
    <div>
      {view.changes.map((change) => (
        <p className={lineClassName} key={change}>
          {change}
        </p>
      ))}
      <p className={lineClassName}>{view.reason}</p>
      {view.costDifference === null ? null : <p className={lineClassName}>{view.costDifference}</p>}
      {view.hasMdfeDivergence ? (
        <p className={cn(tripStyles.alert, styles.itemAddressChange)} role="note">
          {t('eventTimeline.crewTransfer.mdfeDivergence')}
        </p>
      ) : null}
    </div>
  )
}
