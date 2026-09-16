/* Copyright (c) 2026 Ada Technology. MIT License. */
import { cn } from '@/lib/utils'

import type { MarkedPointKey } from './useBoxDimensionScanner.hook'

import styles from './box-measurement-illustration.module.css'

export type BoxMeasurementIllustrationProps = Readonly<{
  /** `undefined` deixa o desenho decorativo — quem já tem o texto ao lado não repete para o leitor de tela. */
  ariaLabel: string | undefined
  pointShortLabels: Readonly<Record<MarkedPointKey, string>>
  variant: 'full' | 'thumbnail'
}>

/**
 * A caixa vista na diagonal, com o cartão deitado na tampa, os cantos A–D e o pé da quina vertical:
 * a pose que o motor espera (spec 152 D12). Desenhada com `clip-path` sobre `<div>`, sem desenho vetorial cru.
 */
export function BoxMeasurementIllustration({
  ariaLabel,
  pointShortLabels,
  variant,
}: BoxMeasurementIllustrationProps) {
  return (
    <div
      aria-hidden={ariaLabel === undefined ? true : undefined}
      aria-label={ariaLabel}
      className={cn(styles.illustration, variant === 'thumbnail' && styles.thumbnail)}
      role={ariaLabel === undefined ? undefined : 'img'}
    >
      <span className={cn(styles.shape, styles.topFace)} />
      <span className={cn(styles.shape, styles.leftFace)} />
      <span className={cn(styles.shape, styles.rightFace)} />
      <span className={cn(styles.shape, styles.cardBorder)} />
      <span className={cn(styles.shape, styles.card)} />
      <span className={cn(styles.shape, styles.verticalEdge)} />
      {variant === 'full'
        ? (Object.keys(pointShortLabels) as MarkedPointKey[]).map((key) => (
            <span className={styles.point} data-point={key} key={key}>
              {pointShortLabels[key]}
            </span>
          ))
        : null}
    </div>
  )
}
