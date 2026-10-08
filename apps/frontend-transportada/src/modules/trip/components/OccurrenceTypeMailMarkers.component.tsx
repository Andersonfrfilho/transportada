/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import {
  OCCURRENCE_MAIL_MARKERS,
  type OccurrenceMailContext,
} from '@/modules/trip/shared/occurrenceMailTemplate.constant'
import styles from '@/modules/trip/styles/occurrenceTypeMail.module.css'

type OccurrenceTypeMailMarkersProps = Readonly<{
  context: OccurrenceMailContext
  disabled: boolean
  onPick: (marker: string) => void
}>

/** Spec 247 RF5: a lista fechada do campo em foco — o assunto, o corpo e a linha de item têm listas diferentes. */
export function OccurrenceTypeMailMarkers({
  context,
  disabled,
  onPick,
}: OccurrenceTypeMailMarkersProps) {
  const { t } = useTranslation('companySettings')
  const title = t(`occurrenceTypeCatalog.mail.markers.${context}`)

  return (
    <div className={styles.field}>
      <p className={styles.hint}>{title}</p>
      <div aria-label={title} className={styles.markers} role="group">
        {OCCURRENCE_MAIL_MARKERS[context].map((marker) => (
          <button
            className={styles.marker}
            disabled={disabled}
            key={marker}
            onClick={() => onPick(marker)}
            type="button"
          >
            {`{{${marker}}}`}
          </button>
        ))}
      </div>
    </div>
  )
}
