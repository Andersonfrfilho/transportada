import { cn } from '@/lib/utils'

import styles from '../styles/tripTimeline.module.css'
import type { TripTimelineDocumentReleaseText } from '../shared/tripTimelineDocumentRelease.service'

type TripTimelineDocumentReleaseProps = Readonly<{ view: TripTimelineDocumentReleaseText }>

/** O que o evento diz além do título: a parada de origem, se foi a parada inteira e o motivo. */
export function TripTimelineDocumentRelease({ view }: TripTimelineDocumentReleaseProps) {
  const lineClassName = cn(styles.itemDetail, styles.itemAddressChange)

  return (
    <div>
      {view.stop === null ? null : <p className={lineClassName}>{view.stop}</p>}
      {view.scope === null ? null : <p className={lineClassName}>{view.scope}</p>}
      {view.note === null ? null : <p className={lineClassName}>{view.note}</p>}
    </div>
  )
}
