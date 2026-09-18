/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import styles from '../styles/fleet.module.css'

type DriverScoreBadgeProps = Readonly<{ score: number | null }>

/** ADR-0069 §5: faixa de cor da nota — verde ≥80, neutra 50-79, alerta <50. `null` é "sem histórico". */
function scoreTone(score: number | null): 'alert' | 'muted' | 'neutral' | 'ready' {
  if (score === null) return 'muted'
  if (score >= 80) return 'ready'
  if (score >= 50) return 'neutral'
  return 'alert'
}

/**
 * Spec 159 RF10, ADR-0069 §7: a nota do motorista (0-100) ou "sem histórico" — usada no seletor de
 * motoristas da viagem, na listagem e na ficha da frota. Cor por faixa, tokens do design system.
 */
export function DriverScoreBadge({ score }: DriverScoreBadgeProps) {
  const { t } = useTranslation('fleet')
  const tone = scoreTone(score)
  const toneClass =
    tone === 'ready'
      ? styles.driverScoreBadgeReady
      : tone === 'neutral'
        ? styles.driverScoreBadgeNeutral
        : tone === 'alert'
          ? styles.driverScoreBadgeAlert
          : styles.driverScoreBadgeMuted

  return (
    <span className={`${styles.driverScoreBadge} ${toneClass}`}>
      {score === null ? t('driverScore.none') : t('driverScore.value', { score })}
    </span>
  )
}
