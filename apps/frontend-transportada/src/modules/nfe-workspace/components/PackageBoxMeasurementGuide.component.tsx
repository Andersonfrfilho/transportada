/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { BoxMeasurementIllustration } from '@/components/ui/box-measurement-illustration'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type { MarkedPointKey } from '@/components/ui/useBoxDimensionScanner.hook'

import styles from '../styles/packageBoxMeasurementGuide.module.css'

export type PackageBoxMeasurementGuideProps = Readonly<{
  onClose: () => void
  pointShortLabels: Readonly<Record<MarkedPointKey, string>>
}>

const STEP_KEYS = ['1', '2', '3', '4', '5', '6'] as const
const AVOID_KEYS = ['1', '2', '3', '4'] as const

/** "Como medir": a pose que o motor espera, antes de a câmera reclamar do quadro. */
export function PackageBoxMeasurementGuide({
  onClose,
  pointShortLabels,
}: PackageBoxMeasurementGuideProps) {
  const { t } = useTranslation('nfeWorkspace')

  return (
    <section aria-labelledby="package-box-measurement-guide-title" className={styles.guide}>
      <h4 className={styles.title} id="package-box-measurement-guide-title">
        {t('packageBoxes.guide.title')}
      </h4>
      <BoxMeasurementIllustration
        ariaLabel={t('packageBoxes.guide.illustration')}
        pointShortLabels={pointShortLabels}
        variant="full"
      />
      <ol className={styles.steps}>
        {STEP_KEYS.map((key) => (
          <li key={key}>{t(`packageBoxes.guide.steps.${key}`)}</li>
        ))}
      </ol>
      <p className={styles.avoidTitle}>
        <Icon name="alert" size="sm" />
        {t('packageBoxes.guide.avoidTitle')}
      </p>
      <ul className={styles.avoid}>
        {AVOID_KEYS.map((key) => (
          <li key={key}>{t(`packageBoxes.guide.avoid.${key}`)}</li>
        ))}
      </ul>
      <Button onClick={onClose} type="button">
        <Icon name="check" />
        {t('packageBoxes.guide.close')}
      </Button>
    </section>
  )
}
