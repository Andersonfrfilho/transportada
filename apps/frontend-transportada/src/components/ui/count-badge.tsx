/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'

import styles from './count-badge.module.css'

type CountBadgeProps = Readonly<{
  count: number
}>

/**
 * Contagem ao lado do ícone, dentro do botão. Ela é decorativa: o número repete o que as pílulas de
 * filtro já dizem em texto, e o botão hospedeiro carrega o próprio `aria-label`.
 */
export function CountBadge({ count }: CountBadgeProps): JSX.Element | null {
  if (count <= 0) return null

  return (
    <span aria-hidden="true" className={styles.root} data-count-badge="true">
      {count}
    </span>
  )
}
