/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { formatAmount } from '@/modules/shared/decimalAmount.service'

import type { ExpectedVersusClosedRow } from '../shared/expectedVersusClosed.service'
import { isNegative } from '../shared/financialView.service'
import styles from '../styles/tripFinancials.module.css'

type ExpectedVersusClosedTableProps = Readonly<{ rows: readonly ExpectedVersusClosedRow[] }>

function formatDifference(row: ExpectedVersusClosedRow): string {
  if (row.isDifferenceZero) return formatAmount(row.difference)

  return isNegative(row.difference)
    ? formatAmount(row.difference)
    : `+${formatAmount(row.difference)}`
}

/**
 * Spec 225 D6: previsto, fechado e a diferença entre eles, linha a linha. A diferença que dá zero
 * continua na tela dizendo que é zero — "sem diferença" também é informação.
 */
export function ExpectedVersusClosedTable({ rows }: ExpectedVersusClosedTableProps) {
  const { t } = useTranslation('tripFinancials')

  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <caption className={styles.hint}>{t('comparison.caption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('comparison.line')}</th>
            <th scope="col">{t('comparison.expected')}</th>
            <th scope="col">{t('comparison.closed')}</th>
            <th scope="col">{t('comparison.difference')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.line}>
              <th scope="row">{t(`comparison.lines.${row.line}`)}</th>
              <td>{formatAmount(row.expected)}</td>
              <td>{formatAmount(row.closed)}</td>
              <td>
                {formatDifference(row)}
                {row.isDifferenceZero ? ` · ${t('comparison.noDifference')}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
