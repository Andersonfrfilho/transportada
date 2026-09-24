/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'

import type { PackageBox } from '../shared/packageBoxClient.service'
import {
  describePackageBoxEstimate,
  describePackageBoxUnit,
} from '../shared/packageBoxEstimate.service'
import styles from '../styles/packageBoxes.module.css'

type PackageBoxEstimateNoticeProps = Readonly<{
  box: PackageBox
}>

/**
 * Spec 163 (RF09/P5): a unidade informada e, sem medida real, a caixa **estimada** por ela — sempre
 * com o selo "Estimada", nunca no lugar da medida. As ações (medir / confirmar) ficam na linha, ao
 * lado do "Medir" de sempre.
 */
export function PackageBoxEstimateNotice({ box }: PackageBoxEstimateNoticeProps) {
  const { t } = useTranslation('nfeWorkspace')
  const estimate = describePackageBoxEstimate(box)
  const unit = describePackageBoxUnit(box)
  if (estimate === undefined && unit === undefined) return null

  return (
    <div className={styles.estimate}>
      {estimate === undefined ? null : (
        <>
          <p className={styles.estimateHeader}>
            <Badge className={styles.estimateBadge} variant="secondary">
              {t('packageBoxes.estimate.badge')}
            </Badge>
            <span>{t('packageBoxes.estimate.title', { arrangement: estimate.arrangement })}</span>
          </p>
          <p className={styles.hint}>
            {t('packageBoxes.estimate.dimensions', {
              height: estimate.height,
              length: estimate.length,
              width: estimate.width,
            })}
            {estimate.volumeLitres === undefined
              ? null
              : ` · ${t('packageBoxes.estimate.volume', { litres: estimate.volumeLitres })}`}
            {estimate.grossWeightKg === undefined
              ? null
              : ` · ${t('packageBoxes.estimate.weight', { kilograms: estimate.grossWeightKg })}`}
          </p>
          <p className={styles.hint}>{t('packageBoxes.estimate.explanation')}</p>
        </>
      )}
      {unit === undefined ? null : (
        <p className={styles.hint}>
          {t('packageBoxes.estimate.unit', {
            height: unit.height,
            length: unit.length,
            width: unit.width,
          })}
          {unit.grossWeightGrams === undefined
            ? null
            : ` · ${t('packageBoxes.estimate.unitWeight', { grams: unit.grossWeightGrams })}`}
        </p>
      )}
    </div>
  )
}
