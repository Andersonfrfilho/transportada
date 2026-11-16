/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'

import { OptionLogo } from '@/components/ui/select'

import { resolveCardBrandLogo } from '../shared/cardBrandLogo.service'
import styles from '../styles/expenses.module.css'

/** Spec 331: o logo do banco do cartão ao lado do tipo na lista; tipo sem marca conhecida não mostra nada. */
export function CardBrandLogo({ name }: Readonly<{ name: string }>): JSX.Element | null {
  const logo = resolveCardBrandLogo(name)
  return logo === undefined ? null : <OptionLogo className={styles.cardLogo ?? ''} logo={logo} />
}
