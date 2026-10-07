/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'

import {
  navigateToCargoArrivals,
  navigateToCargoPreviews,
} from '../shared/cargoReceivingRoute.service'
import styles from '../styles/cargoPreview.module.css'

export type CargoReceivingSection = 'arrivals' | 'previews'

type CargoReceivingNavProps = Readonly<{ active: CargoReceivingSection }>

/** As duas visões de /recebimento: o item de menu é um só ("Recebimento"), e a escolha mora aqui. */
export function CargoReceivingNav({ active }: CargoReceivingNavProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const navigator = useMemo(createBrowserWorkspaceNavigator, [])
  const sections: readonly Readonly<{ id: CargoReceivingSection; open: () => void }>[] = [
    { id: 'arrivals', open: () => navigateToCargoArrivals(navigator) },
    { id: 'previews', open: () => navigateToCargoPreviews(navigator) },
  ]

  return (
    <nav aria-label={t('preview.nav.label')} className={styles.sectionNav}>
      {sections.map((section) => (
        <button
          aria-current={section.id === active ? 'page' : undefined}
          className={section.id === active ? styles.sectionTabActive : styles.sectionTab}
          key={section.id}
          onClick={section.open}
          type="button"
        >
          {t(`preview.nav.${section.id}`)}
        </button>
      ))}
    </nav>
  )
}
