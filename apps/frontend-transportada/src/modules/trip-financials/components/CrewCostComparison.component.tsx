/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { formatAmount, isZeroAmount } from '@/modules/shared/decimalAmount.service'
import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import type { CrewCostComparisonRow } from '../shared/tripFinancials.types'
import { getTripFinancialsClient } from '../shared/tripFinancialsClient.service'
import { FINANCIALS_PERMISSION } from '../shared/tripFinancialsQueryKey.constant'
import styles from '../styles/tripFinancials.module.css'

type CrewCostComparisonProps = Readonly<{
  from: string
  permissions: readonly string[]
  to: string
}>

type ComparisonRow = CrewCostComparisonRow

/** Conta com lacuna não afirma diferença: um "sem diferença" aí seria número de aparência fechada. */
function hasGap(row: ComparisonRow): boolean {
  return row.calculatedHasGaps || row.informedHasGaps
}

function resolveDifferenceClass(row: ComparisonRow): string | undefined {
  if (hasGap(row) || isZeroAmount(row.differenceAmount)) return undefined

  return row.differenceAmount.startsWith('-') ? styles.amountIn : styles.amountOut
}

function formatDifferenceCell(input: {
  readonly row: ComparisonRow
  readonly t: (key: string) => string
}): string {
  const { row, t } = input
  if (hasGap(row)) return t('crewComparison.incompleteDifference')

  return isZeroAmount(row.differenceAmount)
    ? `${formatDifference(row.differenceAmount)} · ${t('crewComparison.noDifference')}`
    : formatDifference(row.differenceAmount)
}

function formatDifference(value: string): string {
  return value.startsWith('-') || isZeroAmount(value)
    ? formatAmount(value)
    : `+${formatAmount(value)}`
}

/**
 * Spec 327: gasto × custo, viagem a viagem. "Informado" é o que se combinou pagar ao montar a viagem;
 * "calculado" é a diária que a conta estimaria sozinha. Diferença positiva é pagar mais do que a conta
 * previa (vermelho: sai dinheiro); negativa, menos (verde). Zero continua na tela dizendo que é zero.
 */
export function CrewCostComparison({ from, permissions, to }: CrewCostComparisonProps) {
  const { t } = useTranslation('tripFinancials')
  const formatMoment = useMomentFormatter()
  const canRead = permissions.includes(FINANCIALS_PERMISSION)
  const ready = canRead && from !== '' && to !== ''
  const comparison = useQuery({
    enabled: ready,
    queryFn: () => getTripFinancialsClient().readCrewCostComparison({ from, to }),
    queryKey: ['crew-cost-comparison', from, to],
  })

  if (!canRead) return null

  return (
    <section aria-labelledby="crew-cost-comparison-title" className={styles.panel}>
      <h2 id="crew-cost-comparison-title">{t('crewComparison.title')}</h2>
      <p className={styles.hint}>{t('crewComparison.subtitle')}</p>

      {comparison.isLoading ? (
        <SkeletonGroup label={t('crewComparison.loading')}>
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
        </SkeletonGroup>
      ) : comparison.isError ? (
        <p className={styles.warning} role="alert">
          {t('crewComparison.error')}
        </p>
      ) : comparison.data === undefined || comparison.data.items.length === 0 ? (
        <p className={styles.hint}>{t('crewComparison.empty')}</p>
      ) : (
        <div className={styles.tableScroll}>
          <table className={`${styles.table} ${styles.comparisonTable}`}>
            <caption className={styles.hint}>{t('crewComparison.caption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('crewComparison.trip')}</th>
                <th scope="col">{t('crewComparison.crew')}</th>
                <th scope="col">{t('crewComparison.calculated')}</th>
                <th scope="col">{t('crewComparison.informed')}</th>
                <th scope="col">{t('crewComparison.difference')}</th>
              </tr>
            </thead>
            <tbody>
              {comparison.data.items.map((row) => (
                <tr key={row.tripId}>
                  <th data-label={t('crewComparison.trip')} scope="row">
                    {formatMoment(row.createdAt)}
                  </th>
                  <td data-label={t('crewComparison.crew')}>{row.crewNames.join(', ')}</td>
                  <td data-label={t('crewComparison.calculated')}>
                    {formatAmount(row.calculatedAmount)}
                    {row.calculatedHasGaps ? ` · ${t('crewComparison.incomplete')}` : ''}
                  </td>
                  <td data-label={t('crewComparison.informed')}>
                    {formatAmount(row.informedAmount)}
                  </td>
                  <td
                    data-label={t('crewComparison.difference')}
                    className={resolveDifferenceClass(row)}
                  >
                    {formatDifferenceCell({ row, t })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {comparison.data?.truncated === true ? (
        <p className={styles.warning} role="status">
          {t('crewComparison.truncated')}
        </p>
      ) : null}
    </section>
  )
}
