/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import styles from '../styles/companySettings.module.css'

type CompanySettingsHeaderProps = Readonly<{
  environment: 'homologation' | 'production'
}>

export function CompanySettingsHeader({ environment }: CompanySettingsHeaderProps) {
  const { t } = useTranslation('companySettings')
  const environmentStyle =
    environment === 'production' ? styles.readinessProduction : styles.readinessHomologation
  return (
    <section className={styles.heroPanel}>
      <div className={styles.heroTopline}>
        <p>{t('eyebrow')}</p>
        <span className={`${styles.readinessState} ${environmentStyle}`}>{t(environment)}</span>
      </div>
      <header className={styles.companySettingsHeader}>
        <h1>{t('title')}</h1>
        <p className={styles.heroCopy}>{t('productionBoundary')}</p>
      </header>
      <section className={styles.readinessRail} aria-label={t('readinessTitle')}>
        <span>{t('profileStep')}</span>
        <span>{t('certificateStep')}</span>
        <span>{t('environmentStep')}</span>
      </section>
    </section>
  )
}
