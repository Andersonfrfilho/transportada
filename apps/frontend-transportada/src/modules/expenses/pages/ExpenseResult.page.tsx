/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { Tabs } from '@/components/ui/tabs'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { saveArchiveFile } from '@/modules/shared/archiveDownload.service'

import { useExpenseResultMutations } from '../hooks/useExpenseResult.hook'
import {
  EXPENSE_NO_CUSTOMER_ID,
  EXPENSE_NO_VEHICLE_ID,
  useExpenseResultPage,
} from '../hooks/useExpenseResultPage.hook'
import type { ExpenseExportFormat, ExpenseResultLine } from '../shared/expensesResult.types'
import {
  amountPerKm,
  formatMarginPercent,
  formatVariationPercent,
  isNegativeAmount,
  lineMarginPercent,
  monthPeriod,
  subtractAmounts,
} from '../shared/expensesResultView.service'
import { formatCivilDate } from '../shared/expensesView.service'
import styles from '../styles/expenses.module.css'

type GroupKind = 'customer' | 'trip' | 'vehicle'
const SHORT_ID_LENGTH = 8

/** Spec 325 T5.2/T5.2b (RF14, RF15, RF18 a RF20): "Resultado do mês", com filtros e exportação. */
export function ExpenseResultPage() {
  const { t } = useTranslation('expenses')
  const page = useExpenseResultPage()
  const { exportResult } = useExpenseResultMutations()
  const [groupKind, setGroupKind] = useState<GroupKind>('trip')
  const [exportingFormat, setExportingFormat] = useState<ExpenseExportFormat | null>(null)
  const { filters, result, previous, unitCosts } = page

  function goToExpenses() {
    window.history.pushState({}, '', '/contas')
    window.dispatchEvent(new PopStateEvent('popstate'))
  }

  function runExport(format: ExpenseExportFormat) {
    setExportingFormat(format)
    exportResult.mutate(
      { ...page.query, format },
      {
        onSettled: () => setExportingFormat(null),
        onSuccess: (file) => saveArchiveFile(file),
      },
    )
  }

  if (page.isAuthLoading) {
    return (
      <main className={styles.shell}>
        <SkeletonGroup label={t('resultPage.loading')}>
          <Skeleton height="2.5rem" />
        </SkeletonGroup>
      </main>
    )
  }

  if (!page.canRead) {
    return (
      <main className={styles.shell}>
        <header className={styles.header}>
          <h1>{t('resultPage.title')}</h1>
        </header>
        <p className={styles.error} role="alert">
          {t('resultPage.forbidden')}
        </p>
      </main>
    )
  }

  const vehicleOptions = [
    { label: t('resultPage.filters.noVehicle'), value: EXPENSE_NO_VEHICLE_ID },
    ...page.vehicles,
  ]
  const customerOptions = [
    { label: t('resultPage.filters.noCustomer'), value: EXPENSE_NO_CUSTOMER_ID },
    ...page.customers,
  ]

  function lineLabel(kind: GroupKind, line: ExpenseResultLine): string {
    if (kind === 'vehicle') {
      return line.id === EXPENSE_NO_VEHICLE_ID
        ? t('resultPage.filters.noVehicle')
        : page.labelOf.vehicle(line.id)
    }
    if (kind === 'customer') {
      return line.id === EXPENSE_NO_CUSTOMER_ID
        ? t('resultPage.filters.noCustomer')
        : page.labelOf.customer(line.id)
    }
    return line.id.slice(0, SHORT_ID_LENGTH)
  }

  function renderIndicators() {
    if (result === undefined) return null
    const { totals } = result
    const margin = formatMarginPercent(totals.profit, totals.revenue)
    const previousMargin =
      previous === undefined
        ? null
        : formatMarginPercent(previous.totals.profit, previous.totals.revenue)
    const revenueVariation =
      previous === undefined
        ? null
        : formatVariationPercent(totals.revenue, previous.totals.revenue)
    const profitVariation =
      previous === undefined ? null : formatVariationPercent(totals.profit, previous.totals.profit)
    const kilometers = unitCosts?.general.kilometers ?? null
    const totalCost = subtractAmounts(totals.revenue, totals.profit)
    const costPerKm = kilometers === null ? null : amountPerKm(totalCost, kilometers)
    const revenuePerKm = kilometers === null ? null : amountPerKm(totals.revenue, kilometers)
    const profitPerKm = kilometers === null ? null : amountPerKm(totals.profit, kilometers)
    const variationText = (value: string | null) =>
      value === null ? null : t('resultPage.indicators.variation', { value })
    const money = (value: string | null) => (value === null ? '—' : formatAmount(value))

    return (
      <dl className={styles.indicators}>
        <div>
          <dt>{t('resultPage.indicators.revenue')}</dt>
          <dd>{formatAmount(totals.revenue)}</dd>
          <small>{variationText(revenueVariation)}</small>
        </div>
        <div>
          <dt>{t('resultPage.indicators.tripCost')}</dt>
          <dd>{formatAmount(totals.tripCost)}</dd>
          <small>{t('resultPage.indicators.tripCostHint')}</small>
        </div>
        <div>
          <dt>{t('resultPage.indicators.expenses')}</dt>
          <dd>{formatAmount(totals.expensesTotal)}</dd>
          <small>{t('resultPage.indicators.expensesHint')}</small>
        </div>
        <div>
          <dt>{t('resultPage.indicators.profit')}</dt>
          <dd className={isNegativeAmount(totals.profit) ? styles.amountOut : styles.amountIn}>
            {formatAmount(totals.profit)}
          </dd>
          <small>{variationText(profitVariation)}</small>
        </div>
        <div>
          <dt>{t('resultPage.indicators.margin')}</dt>
          <dd>{margin ?? '—'}</dd>
          <small>
            {previousMargin === null
              ? null
              : t('resultPage.indicators.previousMargin', { value: previousMargin })}
          </small>
        </div>
        <div>
          <dt>{t('resultPage.indicators.costPerKm')}</dt>
          <dd>{money(costPerKm)}</dd>
          <small>
            {kilometers === null
              ? null
              : t('resultPage.indicators.costPerKmHint', {
                  km: kilometers.replace(/\.0+$/, ''),
                  trips: result.byTrip.length,
                })}
          </small>
        </div>
        <div>
          <dt>{t('resultPage.indicators.revenuePerKm')}</dt>
          <dd>{money(revenuePerKm)}</dd>
        </div>
        <div>
          <dt>{t('resultPage.indicators.profitPerKm')}</dt>
          <dd>{money(profitPerKm)}</dd>
        </div>
      </dl>
    )
  }

  function renderTrend() {
    return (
      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>{t('resultPage.trend.title')}</h2>
        </div>
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t('resultPage.trend.month')}</th>
                <th scope="col">{t('resultPage.trend.revenue')}</th>
                <th scope="col">{t('resultPage.trend.cost')}</th>
                <th scope="col">{t('resultPage.trend.profit')}</th>
                <th scope="col">{t('resultPage.trend.margin')}</th>
              </tr>
            </thead>
            <tbody>
              {page.trendMonths.map(({ competence, result: month }) => {
                const label = formatCivilDate(monthPeriod(competence).from).slice(3)
                if (month === undefined) {
                  return (
                    <tr key={competence}>
                      <td data-column={t('resultPage.trend.month')}>{label}</td>
                      <td colSpan={4}>
                        <Skeleton height="1.25rem" />
                      </td>
                    </tr>
                  )
                }
                const cost = subtractAmounts(month.totals.revenue, month.totals.profit)
                return (
                  <tr key={competence}>
                    <td data-column={t('resultPage.trend.month')}>{label}</td>
                    <td data-column={t('resultPage.trend.revenue')}>
                      {formatAmount(month.totals.revenue)}
                    </td>
                    <td data-column={t('resultPage.trend.cost')}>{formatAmount(cost)}</td>
                    <td data-column={t('resultPage.trend.profit')}>
                      <strong>{formatAmount(month.totals.profit)}</strong>
                    </td>
                    <td data-column={t('resultPage.trend.margin')}>
                      {formatMarginPercent(month.totals.profit, month.totals.revenue) ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    )
  }

  function renderGroup(kind: GroupKind) {
    if (result === undefined) return null
    const lines =
      kind === 'trip' ? result.byTrip : kind === 'vehicle' ? result.byVehicle : result.byCustomer
    if (lines.length === 0) return <p className={styles.hint}>{t('resultPage.empty')}</p>
    const nameHeader = t(`resultPage.columns.${kind}`)
    return (
      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">{nameHeader}</th>
              <th scope="col">{t('resultPage.columns.revenue')}</th>
              <th scope="col">{t('resultPage.columns.cost')}</th>
              <th scope="col">{t('resultPage.columns.vehicleShare')}</th>
              <th scope="col">{t('resultPage.columns.generalShare')}</th>
              <th scope="col">{t('resultPage.columns.margin')}</th>
              <th scope="col">{t('resultPage.columns.percent')}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td data-column={nameHeader}>
                  <strong className={kind === 'trip' ? styles.tripCode : undefined}>
                    {lineLabel(kind, line)}
                  </strong>
                </td>
                <td data-column={t('resultPage.columns.revenue')}>{formatAmount(line.revenue)}</td>
                <td data-column={t('resultPage.columns.cost')}>{formatAmount(line.cost)}</td>
                <td data-column={t('resultPage.columns.vehicleShare')}>
                  {formatAmount(line.vehicleShare)}
                </td>
                <td data-column={t('resultPage.columns.generalShare')}>
                  {formatAmount(line.generalShare)}
                </td>
                <td data-column={t('resultPage.columns.margin')}>
                  <strong className={isNegativeAmount(line.margin) ? styles.amountOut : undefined}>
                    {formatAmount(line.margin)}
                  </strong>
                </td>
                <td data-column={t('resultPage.columns.percent')}>
                  {lineMarginPercent(line) ?? '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const groupLabel = t(
    `resultPage.tabs.kind${groupKind === 'trip' ? 'Trip' : groupKind === 'vehicle' ? 'Vehicle' : 'Customer'}`,
  )

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.panelHead}>
          <h1>{t('resultPage.title')}</h1>
          <Button onClick={goToExpenses} size="sm" type="button" variant="secondary">
            {t('resultPage.back')}
          </Button>
        </div>
        <p className={styles.hint}>{t('resultPage.subtitle')}</p>
      </header>

      <section aria-label={t('resultPage.filters.period')} className={styles.filters}>
        <div className={styles.field}>
          <span>{t('resultPage.filters.period')}</span>
          <DateRangePicker
            ariaLabel={t('resultPage.filters.period')}
            clearLabel={t('resultPage.filters.clearDates')}
            compact={false}
            from={filters.from}
            nextMonthLabel={t('resultPage.filters.nextMonth')}
            onChange={(from, to) => {
              if (from !== '' && to !== '') page.setPeriod(from, to)
            }}
            placeholder={t('resultPage.filters.placeholder')}
            previousMonthLabel={t('resultPage.filters.previousMonth')}
            to={filters.to}
          />
        </div>
        <div className={styles.field}>
          <span>{t('resultPage.filters.vehicle')}</span>
          <Select
            ariaLabel={t('resultPage.filters.vehicle')}
            clearable
            onChange={(value) => page.setFilter('vehicleId', value)}
            options={vehicleOptions}
            placeholder={t('resultPage.filters.all')}
            value={filters.vehicleId}
          />
        </div>
        <div className={styles.field}>
          <span>{t('resultPage.filters.customer')}</span>
          <Select
            ariaLabel={t('resultPage.filters.customer')}
            clearable
            onChange={(value) => page.setFilter('customerId', value)}
            options={customerOptions}
            placeholder={t('resultPage.filters.all')}
            value={filters.customerId}
          />
        </div>
        <div className={styles.field}>
          <span>{t('resultPage.filters.category')}</span>
          <Select
            ariaLabel={t('resultPage.filters.category')}
            clearable
            onChange={(value) => page.setFilter('categoryId', value)}
            options={page.categories.map((category) => ({
              label: category.name,
              value: category.id,
            }))}
            placeholder={t('resultPage.filters.allFeminine')}
            value={filters.categoryId}
          />
        </div>
        <div className={styles.field}>
          <span>{t('resultPage.filters.payee')}</span>
          <Select
            ariaLabel={t('resultPage.filters.payee')}
            clearable
            onChange={(value) => page.setFilter('payeeDriverId', value)}
            options={page.driverOptions}
            placeholder={t('resultPage.filters.all')}
            value={filters.payeeDriverId}
          />
        </div>
      </section>

      <div className={styles.exportBar}>
        <p className={styles.hint}>{t('resultPage.filters.note')}</p>
        <div className={styles.rowActions}>
          {(['pdf', 'csv'] as const).map((format) => (
            <Button
              disabled={exportingFormat !== null}
              key={format}
              onClick={() => runExport(format)}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Icon name="download" />
              {exportingFormat === format
                ? t('resultPage.export.exporting')
                : t(`resultPage.export.${format}`)}
            </Button>
          ))}
        </div>
      </div>
      {exportResult.isError ? (
        <p className={styles.error} role="alert">
          {t('resultPage.export.failed')}
        </p>
      ) : null}

      {page.error === null ? null : (
        <p className={styles.error} role="alert">
          {t('resultPage.errors.REQUEST_FAILED')}
        </p>
      )}

      {page.isLoading ? (
        <SkeletonGroup label={t('resultPage.loading')}>
          <Skeleton height="6rem" />
          <Skeleton height="10rem" />
        </SkeletonGroup>
      ) : (
        <>
          {renderIndicators()}
          {result === undefined || result.unallocatedItems.length === 0 ? null : (
            <p className={styles.notice}>
              {t('resultPage.unallocated', { amount: formatAmount(result.unallocatedTotal) })}
            </p>
          )}
          <p className={styles.hint}>{t('resultPage.notice')}</p>
          {renderTrend()}
          <section className={styles.panel}>
            <div className={styles.panelHead}>
              <h2>{t('resultPage.tabs.title', { kind: groupLabel })}</h2>
            </div>
            <Tabs
              ariaLabel={t('resultPage.tabs.ariaLabel')}
              items={(['trip', 'vehicle', 'customer'] as const).map((kind) => ({
                id: kind,
                label: t(`resultPage.tabs.${kind}`),
                panel: kind === groupKind ? renderGroup(kind) : null,
              }))}
              onChange={(id) => setGroupKind(id as GroupKind)}
              value={groupKind}
            />
            <p className={styles.hint}>{t('resultPage.footnote')}</p>
          </section>
        </>
      )}
    </main>
  )
}
