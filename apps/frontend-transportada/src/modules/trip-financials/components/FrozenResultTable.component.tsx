/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { formatAmount } from '@/modules/shared/decimalAmount.service'

import {
  countUnknownParcels,
  describeRevenueCoverage,
  formatMargin,
  isNegative,
  splitParcels,
} from '../shared/financialView.service'
import type { TripFinancialResult } from '../shared/tripFinancials.types'
import styles from '../styles/tripFinancials.module.css'

type FrozenResultTableProps = Readonly<{ result: TripFinancialResult }>

/**
 * Os números do resultado **congelado**: os quatro totais, os avisos de conta aproximada e cada
 * parcela com sua origem. Saiu do painel porque ele passou do teto de 200 linhas, não por reuso.
 */
export function FrozenResultTable({ result }: FrozenResultTableProps) {
  const { t } = useTranslation('tripFinancials')
  const { costs, taxes } = splitParcels(result)
  const coverage = describeRevenueCoverage(result)
  const unknown = countUnknownParcels(result)
  const margin = formatMargin(result.marginRate)

  return (
    <>
      <dl className={styles.totals}>
        <div>
          <dt>{t('panel.revenue')}</dt>
          <dd className={styles.amountIn}>{formatAmount(result.revenueAmount)}</dd>
        </div>
        <div>
          <dt>{t('panel.tax')}</dt>
          <dd className={styles.amountOut}>{formatAmount(result.taxTotal)}</dd>
        </div>
        <div>
          <dt>{t('panel.cost')}</dt>
          <dd className={styles.amountOut}>{formatAmount(result.costTotal)}</dd>
        </div>
        <div>
          <dt>{t('panel.net')}</dt>
          <dd className={isNegative(result.netAmount) ? styles.negative : styles.amountIn}>
            {formatAmount(result.netAmount)}
            {margin === null ? '' : ` · ${margin}`}
          </dd>
        </div>
      </dl>

      {coverage === null ? null : (
        <p className={styles.warning} role="status">
          {t('panel.partialRevenue', coverage)}
        </p>
      )}
      {unknown === 0 ? null : (
        <p className={styles.warning} role="status">
          {t('panel.unknownParcels', { count: unknown })}
        </p>
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">{t('panel.parcel')}</th>
            <th scope="col">{t('panel.amount')}</th>
            <th scope="col">{t('panel.source')}</th>
          </tr>
        </thead>
        <tbody>
          {[...taxes, ...costs].map((parcel) => (
            <tr key={parcel.kind}>
              <td>{t(`parcel.${parcel.kind}`)}</td>
              <td className={styles.amountOut}>{formatAmount(parcel.amount)}</td>
              <td>
                {t(`source.${parcel.source}`)}
                {parcel.note === ''
                  ? ''
                  : ` · ${t(`gap.${parcel.note}`, { defaultValue: parcel.note })}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
