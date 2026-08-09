/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { CERTIFICATE_PURPOSES } from '../shared/companySettingsClient.service'
import styles from '../styles/companySettings.module.css'

const FIELD_WIDTH_PATTERN = ['85%', '60%', '70%', '45%'] as const
const PROFILE_FIELD_COUNT = 17
const CTE_FIELD_COUNT = 3
const CTE_RETRY_FIELD_COUNT = 2
const MDFE_FIELD_COUNT = 7
const BILLING_FIELD_COUNT = 6

function fieldWidth(index: number): string {
  return FIELD_WIDTH_PATTERN[index % FIELD_WIDTH_PATTERN.length] ?? '100%'
}

type FieldSectionSkeletonProps = Readonly<{ count: number; legendWidth: string }>

function FieldSectionSkeleton({ count, legendWidth }: FieldSectionSkeletonProps) {
  return (
    <div className={styles.fieldGroup}>
      <Skeleton className={styles.skeletonLegend} variant="text" width={legendWidth} />
      <div className={styles.fieldGrid}>
        {Array.from({ length: count }, (_, index) => (
          <Skeleton height="var(--field-height)" key={index} width={fieldWidth(index)} />
        ))}
      </div>
    </div>
  )
}

function SettingsPanelSkeleton() {
  return (
    <section className={styles.settingsPanel}>
      <div className={styles.sectionHeading}>
        <Skeleton variant="text" width="6rem" />
        <Skeleton variant="text" width="12rem" />
      </div>
      <div className={styles.settingsForm}>
        <FieldSectionSkeleton count={PROFILE_FIELD_COUNT} legendWidth="10rem" />
        <FieldSectionSkeleton count={CTE_FIELD_COUNT} legendWidth="8rem" />
        <FieldSectionSkeleton count={CTE_RETRY_FIELD_COUNT} legendWidth="9rem" />
        <FieldSectionSkeleton count={MDFE_FIELD_COUNT} legendWidth="9rem" />
        <FieldSectionSkeleton count={BILLING_FIELD_COUNT} legendWidth="11rem" />
        <Skeleton height="3rem" width="10rem" />
      </div>
    </section>
  )
}

function LogoPanelSkeleton() {
  return (
    <section className={styles.certificateForm}>
      <Skeleton variant="text" width="8rem" />
      <Skeleton variant="text" width="16rem" />
      <div className={styles.logoPreview}>
        <Skeleton height="4rem" width="10rem" />
      </div>
      <Skeleton height="3rem" width="100%" />
    </section>
  )
}

function CertificatePanelSkeleton() {
  return (
    <section className={styles.certificateForm}>
      <Skeleton variant="text" width="10rem" />
      <Skeleton height="var(--field-height)" width="60%" />
      <Skeleton variant="text" width="14rem" />
      <Skeleton height="3rem" width="100%" />
      <Skeleton height="3rem" width="100%" />
      <Skeleton height="3rem" width="10rem" />
    </section>
  )
}

function SignalPanelSkeleton() {
  return (
    <section className={styles.signalPanel}>
      <Skeleton variant="text" width="6rem" />
      <Skeleton variant="text" width="12rem" />
      <Skeleton variant="text" width="18rem" />
      {CERTIFICATE_PURPOSES.map((purpose) => (
        <div className={styles.skeletonSignalRow} key={purpose}>
          <Skeleton variant="text" width="5rem" />
          <Skeleton variant="text" width="10rem" />
        </div>
      ))}
    </section>
  )
}

export function CompanySettingsSkeleton() {
  const { t } = useTranslation('companySettings')
  return (
    <SkeletonGroup className={styles.workspaceDeck} label={t('loading')}>
      <div className={styles.primaryColumn}>
        <SettingsPanelSkeleton />
        <LogoPanelSkeleton />
        <CertificatePanelSkeleton />
      </div>
      <aside className={styles.secondaryColumn}>
        <SignalPanelSkeleton />
      </aside>
    </SkeletonGroup>
  )
}
