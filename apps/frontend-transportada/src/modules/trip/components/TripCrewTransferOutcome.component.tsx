/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { CrewTransferOutcome } from '../shared/tripCrewTransfer.service'
import styles from '../styles/trip.module.css'

type TripCrewTransferOutcomeProps = Readonly<{ outcome: CrewTransferOutcome }>

/**
 * Spec 249 RF4/RF5: o que mudou depois da troca — a diferença de custo (positiva ou negativa) e, só
 * quando o conjunto de motoristas mudou com MDF-e autorizado, o aviso de que o manifesto segue com
 * o condutor anterior.
 */
export function TripCrewTransferOutcome({ outcome }: TripCrewTransferOutcomeProps) {
  const { t } = useTranslation('trip')

  return (
    <section aria-live="polite" className={styles.fieldGrid}>
      <p className={styles.successNotice}>{t('crewTransferDialog.outcome.done')}</p>
      <p>{t(`crewTransferDialog.outcome.${outcome.direction}`)}</p>
      <ul className={styles.mdfeGateList}>
        <li className={styles.mdfeGateListItem}>
          <span>{t('crewTransferDialog.outcome.costBefore')}</span>
          <strong>{outcome.before}</strong>
        </li>
        <li className={styles.mdfeGateListItem}>
          <span>{t('crewTransferDialog.outcome.costAfter')}</span>
          <strong>{outcome.after}</strong>
        </li>
        <li className={styles.mdfeGateListItem}>
          <span>{t('crewTransferDialog.outcome.difference')}</span>
          <strong>{outcome.difference}</strong>
        </li>
      </ul>
      {outcome.hasGaps ? (
        <p className={styles.hint}>{t('crewTransferDialog.outcome.gaps')}</p>
      ) : null}
      {outcome.hasMdfeDivergence ? (
        <p className={styles.alert} role="alert">
          {t('crewTransferDialog.outcome.mdfeDivergence')}
        </p>
      ) : null}
    </section>
  )
}
