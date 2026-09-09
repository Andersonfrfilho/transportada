/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { isNegative } from '@/modules/trip-financials/shared/financialView.service'

import {
  formatDistance,
  formatDuration,
  type SuggestionValuation,
} from '../shared/suggestionValuation.service'
import styles from '../styles/routing.module.css'

type SuggestionValuationReportProps = Readonly<{
  isLoading: boolean
  valuation: null | SuggestionValuation
  vehicleLabels: Readonly<Record<string, string>>
}>

/**
 * Spec 101 T7: o que a distribuição inteira rende, custa e demora — e quais entregas couberam em
 * qual veículo.
 *
 * ⚠️ **O tempo é a SOMA das durações, não o máximo.** São caminhões distintos rodando em paralelo,
 * e a pergunta que este relatório responde é quanto custa operar o conjunto — não quando o último
 * chega. A segunda pergunta, se um dia interessar, é um campo novo ao lado deste.
 */
export function SuggestionValuationReport({
  isLoading,
  valuation,
  vehicleLabels,
}: SuggestionValuationReportProps) {
  const { t } = useTranslation('routing')
  const { t: tFinanceiro } = useTranslation('tripFinancials')

  if (isLoading) {
    return (
      <SkeletonGroup className={styles.report} label={t('report.loading')}>
        <Skeleton variant="text" width="9rem" />
        <Skeleton variant="text" width="14rem" />
        <Skeleton variant="text" width="11rem" />
      </SkeletonGroup>
    )
  }

  if (valuation === null) return null

  const { report, vehicles } = valuation
  const distance = formatDistance(report.totalDistanceMeters)
  const duration = formatDuration(report.totalDurationSeconds)

  return (
    <section aria-label={t('report.title')} className={styles.report}>
      <h3>{t('report.title')}</h3>

      <dl className={styles.reportTotals}>
        <div>
          <dt>{t('report.revenue')}</dt>
          <dd>{formatAmount(report.totalRevenue)}</dd>
        </div>
        <div>
          <dt>{t('report.cost')}</dt>
          <dd>{formatAmount(report.totalCost)}</dd>
        </div>
        <div>
          <dt>{t('report.margin')}</dt>
          <dd className={isNegative(report.totalMargin) ? styles.negative : undefined}>
            {formatAmount(report.totalMargin)}
          </dd>
        </div>
        <div>
          <dt>{t('report.distance')}</dt>
          <dd>{distance ?? t('report.unknown')}</dd>
        </div>
        <div>
          <dt>{t('report.duration')}</dt>
          <dd>{duration ?? t('report.unknown')}</dd>
        </div>
      </dl>

      {/* ⚠️ A marca depende de `hasGaps` e de nada mais: um `&&` a mais é o caminho pelo qual ela
          desaparece sem ninguém notar, e o total volta a se apresentar como previsão fechada. */}
      {report.hasGaps ? (
        <p className={styles.reportIncomplete} role="status">
          {t('report.incomplete')}
          {report.gaps.length === 0
            ? ''
            : ` ${report.gaps
                .map((gap) => tFinanceiro(`gap.${gap}`, { defaultValue: gap }))
                .join(', ')}`}
        </p>
      ) : null}

      <ul className={styles.reportDeliveries}>
        {vehicles.map((vehicle) => (
          <li key={vehicle.vehicleId}>
            {vehicleLabels[vehicle.vehicleId] ?? vehicle.vehicleId}
            {' · '}
            {t('report.deliveries', { count: vehicle.documentCount })}
            {' · '}
            {formatDistance(vehicle.distanceMeters) ?? t('report.unknown')}
          </li>
        ))}
      </ul>
    </section>
  )
}
