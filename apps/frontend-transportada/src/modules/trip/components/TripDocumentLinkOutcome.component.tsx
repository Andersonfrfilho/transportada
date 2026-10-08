/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { DocumentLinkOutcome } from '../shared/tripDocumentLink.service'
import styles from '../styles/trip.module.css'

type TripDocumentLinkOutcomeProps = Readonly<{ outcome: DocumentLinkOutcome }>

/**
 * Spec 257 D6/D7: quantas notas entraram, quantas já estavam em viagem viva (puladas) e os dois
 * avisos fiscais — nota sem CT-e autorizado e manifesto que segue sem as notas novas.
 */
export function TripDocumentLinkOutcome({ outcome }: TripDocumentLinkOutcomeProps) {
  const { t } = useTranslation('trip')

  return (
    <section aria-live="polite" className={styles.fieldGrid}>
      <p className={styles.successNotice}>
        {outcome.hasNothingLinked
          ? t('linkDocumentsDialog.outcome.none')
          : t('linkDocumentsDialog.outcome.linked', { count: outcome.linkedCount })}
      </p>
      {outcome.skippedCount > 0 ? (
        <p className={styles.hint}>
          {t('linkDocumentsDialog.outcome.skipped', { count: outcome.skippedCount })}
        </p>
      ) : null}
      {outcome.withoutCteCount > 0 ? (
        <p className={styles.alert} role="alert">
          {t('linkDocumentsDialog.outcome.withoutCte', { count: outcome.withoutCteCount })}
        </p>
      ) : null}
      {outcome.hasMdfeDivergence ? (
        <p className={styles.alert} role="alert">
          {t('linkDocumentsDialog.outcome.mdfeDivergence')}
        </p>
      ) : null}
    </section>
  )
}
