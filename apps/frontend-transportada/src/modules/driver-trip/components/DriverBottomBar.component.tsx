/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import styles from '../styles/driverTrip.module.css'

export type DriverSection = 'profile' | 'trip'

type DriverBottomBarProps = Readonly<{
  onSelect: (section: DriverSection) => void
  section: DriverSection
}>

/** Spec 082 D1: duas seções, alcançáveis com o polegar — a barra fica fixa no rodapé. */
export function DriverBottomBar({ onSelect, section }: DriverBottomBarProps) {
  const { t } = useTranslation('driverTrip')

  return (
    <nav aria-label={t('nav.label')} className={styles.bottomBar}>
      <button
        aria-current={section === 'trip' ? 'page' : undefined}
        className={section === 'trip' ? styles.bottomBarItemActive : styles.bottomBarItem}
        type="button"
        onClick={() => onSelect('trip')}
      >
        <Icon name="workspace-driver-trip" />
        <span>{t('nav.trip')}</span>
      </button>
      <button
        aria-current={section === 'profile' ? 'page' : undefined}
        className={section === 'profile' ? styles.bottomBarItemActive : styles.bottomBarItem}
        type="button"
        onClick={() => onSelect('profile')}
      >
        <Icon name="workspace-users" />
        <span>{t('nav.profile')}</span>
      </button>
    </nav>
  )
}
