/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { CSSProperties } from 'react'

import { cn } from '@/lib/utils'
import { resolveProgressPercent } from '@/modules/shared/progress.service'

import styles from './progress.module.css'

type ProgressBarProps = Readonly<{
  completed: number
  label: string
  total: number
  valueText: string
}>

/**
 * ⚠️ **Acima do teto a barra enche e muda de cor** — ela não tem como desenhar 166% de largura, e
 * `resolveProgressPercent` apara em 100 de propósito (o `aria-valuenow` é 0..100). O que não pode é
 * o estouro **desaparecer**: uma barra cheia igual à do carregamento exato faria alguém continuar
 * carregando. O número ao lado continua dizendo 166%, e a cor diz que passou.
 */
export function ProgressBar({ completed, label, total, valueText }: ProgressBarProps) {
  const percent = resolveProgressPercent({ completed, total })
  const isOverCapacity = total > 0 && completed > total
  // Única grandeza que atravessa: a largura. Cor, altura e animação continuam no módulo de estilo.
  const trackStyle = { '--progress-value': `${percent}%` } as CSSProperties

  return (
    <div className={styles.progress}>
      <div
        aria-label={label}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percent}
        aria-valuetext={valueText}
        className={styles.track}
        role="progressbar"
        style={trackStyle}
      >
        <div
          className={cn(
            styles.indicator,
            percent === 100 && !isOverCapacity && styles.indicatorComplete,
            isOverCapacity && styles.indicatorOver,
          )}
        />
      </div>
      <p className={styles.value}>{valueText}</p>
    </div>
  )
}
