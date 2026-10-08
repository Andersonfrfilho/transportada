import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import tripStyles from '../styles/trip.module.css'
import styles from '../styles/tripTimeline.module.css'
import type { TripTimelineDocumentsAddedText } from '../shared/tripTimelineDocumentsAdded.service'

type TripTimelineDocumentsAddedProps = Readonly<{ view: TripTimelineDocumentsAddedText }>

/** Spec 257 D9: o que o evento diz além do título — a contagem, o motivo e os avisos fiscais. */
export function TripTimelineDocumentsAdded({ view }: TripTimelineDocumentsAddedProps) {
  const { t } = useTranslation('trip')
  const lineClassName = cn(styles.itemDetail, styles.itemAddressChange)

  return (
    <div>
      <p className={lineClassName}>{view.count}</p>
      <p className={lineClassName}>{view.reason}</p>
      {view.cteWarning === null ? null : (
        <p className={cn(tripStyles.alert, styles.itemAddressChange)} role="note">
          {view.cteWarning}
        </p>
      )}
      {view.hasMdfeDivergence ? (
        <p className={cn(tripStyles.alert, styles.itemAddressChange)} role="note">
          {t('eventTimeline.documentsAdded.mdfeDivergence')}
        </p>
      ) : null}
    </div>
  )
}
