/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { useDriverScoreQuery } from '../queries/useDriverScore.query'
import styles from '../styles/fleet.module.css'
import { DriverScoreBadge } from './DriverScoreBadge.component'

type DriverScoreSectionProps = Readonly<{ driverId: string }>

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('pt-BR')
}

/**
 * Spec 159 RF10 (P5): a nota e o porquê dela, na ficha do motorista. Lista, não tabela: a ficha abre
 * num painel lateral estreito, e cinco colunas ali escondiam os pontos e o prazo atrás de rolagem.
 */
export function DriverScoreSection({ driverId }: DriverScoreSectionProps) {
  const { t } = useTranslation('fleet')
  const scoreQuery = useDriverScoreQuery({ driverId })
  const penalties = scoreQuery.data?.penalties ?? []

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('driverScoreSectionTitle')}</legend>
      <p className={styles.hint}>{t('driverScoreSectionHint')}</p>
      <DriverScoreBadge score={scoreQuery.data?.score ?? null} />
      <h3 className={styles.penaltyTitle}>{t('driverPenaltiesTitle')}</h3>
      {penalties.length === 0 ? (
        <p className={styles.hint}>{t('driverPenaltiesEmpty')}</p>
      ) : (
        <ul className={styles.penaltyList}>
          {penalties.map((penalty) => (
            <li className={styles.penaltyItem} key={`${penalty.tripDocumentId}-${penalty.reason}`}>
              <span className={styles.penaltyHeadline}>
                <span>{t(`penaltyReason.${penalty.reason}`)}</span>
                <span className={styles.penaltyPoints}>
                  {t('penaltyPoints', { points: penalty.points })}
                </span>
              </span>
              <span className={styles.hint}>
                {t('penaltyMeta', {
                  deliveredAt: formatDate(penalty.deliveredAt),
                  documentNumber: penalty.documentNumber,
                  expiresAt: formatDate(penalty.expiresAt),
                })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  )
}
