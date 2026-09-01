/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/ui/date-picker'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { formatMargin, isNegative } from '../shared/financialView.service'
import { getTripFinancialsClient } from '../shared/tripFinancialsClient.service'
import {
  FINANCIAL_SUMMARY_GROUPS,
  type FinancialSummaryGroup,
} from '../shared/tripFinancials.types'
import styles from '../styles/tripFinancials.module.css'

/**
 * Spec 061 D5: **somar é tão importante quanto calcular.** Uma viagem isolada não decide nada; o que
 * decide é o acumulado — aquele caminhão se paga, quanto custa cada agregado por real faturado.
 */
export function FinancialResultsWorkspacePage() {
  const { t } = useTranslation('tripFinancials')
  const authQuery = useAuthMeQuery()
  const canRead = (authQuery.data?.data.permissions ?? []).includes('trip.financials')
  const [groupBy, setGroupBy] = useState<FinancialSummaryGroup>('period')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const summary = useQuery({
    enabled: canRead && from !== '' && to !== '',
    queryFn: () => getTripFinancialsClient().readSummary({ from, groupBy, to }),
    queryKey: ['financial-results', from, to, groupBy],
  })

  const calendar = {
    chooseYearLabel: t('workspace.calendar.chooseYear'),
    clearLabel: t('workspace.calendar.clear'),
    nextMonthLabel: t('workspace.calendar.nextMonth'),
    openCalendarLabel: t('workspace.calendar.open'),
    placeholder: t('workspace.calendar.placeholder'),
    previousMonthLabel: t('workspace.calendar.previousMonth'),
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <h1>{t('workspace.title')}</h1>
        <p className={styles.hint}>{t('workspace.subtitle')}</p>
      </header>

      {canRead ? null : (
        <p className={styles.warning} role="alert">
          {t('workspace.forbidden')}
        </p>
      )}

      <section className={styles.filters}>
        <label className={styles.field}>
          {t('workspace.from')}
          <DatePicker
            {...calendar}
            ariaLabel={t('workspace.from')}
            onChange={setFrom}
            value={from}
          />
        </label>
        <label className={styles.field}>
          {t('workspace.to')}
          <DatePicker {...calendar} ariaLabel={t('workspace.to')} onChange={setTo} value={to} />
        </label>
        <label className={styles.field}>
          {t('workspace.groupBy')}
          <Select
            ariaLabel={t('workspace.groupBy')}
            onChange={(value) => setGroupBy(value as FinancialSummaryGroup)}
            options={FINANCIAL_SUMMARY_GROUPS.map((group) => ({
              label: t(`workspace.group.${group}`),
              value: group,
            }))}
            value={groupBy}
          />
        </label>
      </section>

      {summary.isLoading && canRead && from !== '' && to !== '' ? (
        <SkeletonGroup label={t('workspace.loading')}>
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
        </SkeletonGroup>
      ) : summary.data === undefined ? (
        <p className={styles.hint}>{t('workspace.pickPeriod')}</p>
      ) : (
        <>
          <dl className={styles.totals}>
            <div>
              <dt>{t('panel.revenue')}</dt>
              <dd>{summary.data.revenueAmount}</dd>
            </div>
            <div>
              <dt>{t('panel.tax')}</dt>
              <dd>{summary.data.taxTotal}</dd>
            </div>
            <div>
              <dt>{t('panel.cost')}</dt>
              <dd>{summary.data.costTotal}</dd>
            </div>
            <div>
              <dt>{t('panel.net')}</dt>
              <dd className={isNegative(summary.data.netAmount) ? styles.negative : undefined}>
                {summary.data.netAmount}
                {formatMargin(summary.data.marginRate) === null
                  ? ''
                  : ` · ${formatMargin(summary.data.marginRate) ?? ''}`}
              </dd>
            </div>
          </dl>

          {/* A folha entra no total e não nos grupos: ratear salário por viagem é o que a ADR recusa. */}
          <p className={styles.hint}>
            {summary.data.payrollAmount === null
              ? t('workspace.noPayroll')
              : t('workspace.payroll', { amount: summary.data.payrollAmount })}
          </p>
          {summary.data.isComplete ? null : (
            <p className={styles.warning} role="status">
              {t('workspace.approximate')}
            </p>
          )}

          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('workspace.group.label')}</th>
                <th scope="col">{t('workspace.trips')}</th>
                <th scope="col">{t('panel.revenue')}</th>
                <th scope="col">{t('panel.net')}</th>
              </tr>
            </thead>
            <tbody>
              {summary.data.groups.map((group) => (
                <tr key={group.groupId}>
                  <td>{group.groupLabel}</td>
                  <td>{group.tripCount}</td>
                  <td>{group.revenueAmount}</td>
                  <td className={isNegative(group.netAmount) ? styles.negative : undefined}>
                    {group.netAmount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  )
}
