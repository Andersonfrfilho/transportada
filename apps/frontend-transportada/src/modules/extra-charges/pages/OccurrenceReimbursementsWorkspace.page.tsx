/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Icon } from '@/components/ui/icon'
import { MultiSelect } from '@/components/ui/multi-select'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { useOccurrenceReimbursements } from '../hooks/useOccurrenceReimbursements.hook'
import {
  DELIVERY_CHARGE_STATUSES,
  DELIVERY_CHARGE_TYPES,
  type OccurrenceChargeReportFilters,
} from '../shared/extraCharges.types'
import {
  sumSelectedReimbursementAmounts,
  SELECTION_PERIOD_ERROR,
} from '../shared/occurrenceReimbursementSelection.service'
import styles from '../styles/extraCharges.module.css'

/**
 * `exactOptionalPropertyTypes` recusa `{ chargeType: undefined }`: limpar um filtro precisa
 * **remover** a chave, não gravar `undefined` nela.
 */
function withFilter<TKey extends keyof OccurrenceChargeReportFilters>(
  filters: OccurrenceChargeReportFilters,
  key: TKey,
  value: OccurrenceChargeReportFilters[TKey] | undefined,
): OccurrenceChargeReportFilters {
  const next = { ...filters }
  if (value === undefined) delete next[key]
  else next[key] = value
  return next
}

/**
 * Spec 164 T26 (RF32): "Ressarcimentos" — o relatório de cobranças de ocorrência ainda sem lote,
 * com filtro, seleção por linha e o fechamento existente. `trip.financials`: dinheiro tem permissão
 * própria, quem valida ocorrência não vê valor de carona (spec 061 D4).
 */
export function OccurrenceReimbursementsWorkspacePage() {
  const { t } = useTranslation('extraCharges')
  const authQuery = useAuthMeQuery()
  const permissions = authQuery.data?.data.permissions ?? []
  const controller = useOccurrenceReimbursements({ permissions })

  if (!controller.canView) {
    return (
      <main className={styles.shell}>
        <header className={styles.header}>
          <h1>{t('reimbursements.title')}</h1>
        </header>
        <p className={styles.hint} role="alert">
          {t('reimbursements.forbidden')}
        </p>
      </main>
    )
  }

  const rows = controller.report?.items ?? []
  const selectedTotal = sumSelectedReimbursementAmounts(rows, controller.selectedIds)
  const period = controller.selectionPeriod

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <h1>{t('reimbursements.title')}</h1>
        <p className={styles.hint}>{t('reimbursements.subtitle')}</p>
      </header>

      {controller.lastError === null ? null : (
        <p className={styles.error} role="alert">
          {t(`errors.${controller.lastError}`, { defaultValue: t('errors.REQUEST_FAILED') })}
        </p>
      )}

      <section className={styles.panel}>
        <div className={styles.batchForm}>
          <label className={styles.field}>
            {t('reimbursements.filters.contractor')}
            <Select
              ariaLabel={t('reimbursements.filters.contractor')}
              onChange={(value) =>
                controller.setFilters(
                  withFilter(controller.filters, 'contractorId', value === '' ? undefined : value),
                )
              }
              options={controller.contractors.map((contractor) => ({
                label: contractor.displayName === '' ? contractor.taxId : contractor.displayName,
                value: contractor.id,
              }))}
              placeholder={t('reimbursements.filters.contractorAll')}
              value={controller.filters.contractorId ?? ''}
            />
          </label>

          <label className={styles.field}>
            {t('reimbursements.filters.period')}
            <DateRangePicker
              ariaLabel={t('reimbursements.filters.period')}
              clearLabel={t('batch.calendar.clear')}
              from={controller.filters.from ?? ''}
              nextMonthLabel={t('batch.calendar.nextMonth')}
              onChange={(from, to) =>
                controller.setFilters(
                  withFilter(
                    withFilter(controller.filters, 'from', from === '' ? undefined : from),
                    'to',
                    to === '' ? undefined : to,
                  ),
                )
              }
              placeholder={t('reimbursements.filters.periodPlaceholder')}
              previousMonthLabel={t('batch.calendar.previousMonth')}
              to={controller.filters.to ?? ''}
            />
          </label>

          <label className={styles.field}>
            {t('reimbursements.filters.chargeType')}
            <MultiSelect
              ariaLabel={t('reimbursements.filters.chargeType')}
              clearAllLabel={t('reimbursements.filters.chargeTypeClearAll')}
              emptyLabel={t('reimbursements.filters.chargeTypeAll')}
              onChange={(values) =>
                controller.setFilters(
                  withFilter(
                    controller.filters,
                    'chargeType',
                    values[0] as (typeof DELIVERY_CHARGE_TYPES)[number] | undefined,
                  ),
                )
              }
              options={DELIVERY_CHARGE_TYPES.map((chargeType) => ({
                label: t(`chargeType.${chargeType}`),
                value: chargeType,
              }))}
              placeholder={t('reimbursements.filters.chargeTypeAll')}
              removeLabel={t('reimbursements.filters.chargeTypeRemove')}
              searchPlaceholder={t('reimbursements.filters.chargeTypeSearchPlaceholder')}
              summaryLabel={(count) => t('reimbursements.filters.chargeTypeSummary', { count })}
              values={
                controller.filters.chargeType === undefined ? [] : [controller.filters.chargeType]
              }
            />
          </label>

          <label className={styles.field}>
            {t('reimbursements.filters.status')}
            <Select
              ariaLabel={t('reimbursements.filters.status')}
              onChange={(value) =>
                controller.setFilters(
                  withFilter(
                    controller.filters,
                    'status',
                    value === '' ? undefined : (value as (typeof DELIVERY_CHARGE_STATUSES)[number]),
                  ),
                )
              }
              options={DELIVERY_CHARGE_STATUSES.map((status) => ({
                label: t(`chargeStatus.${status}`),
                value: status,
              }))}
              placeholder={t('reimbursements.filters.statusAll')}
              value={controller.filters.status ?? ''}
            />
          </label>

          <label className={styles.field}>
            {t('reimbursements.filters.settlement')}
            <Select
              ariaLabel={t('reimbursements.filters.settlement')}
              onChange={(value) =>
                controller.setFilters(
                  withFilter(
                    controller.filters,
                    'hasSettlement',
                    value === '' ? undefined : value === 'true',
                  ),
                )
              }
              options={[
                { label: t('reimbursements.filters.settlementWith'), value: 'true' },
                { label: t('reimbursements.filters.settlementWithout'), value: 'false' },
              ]}
              placeholder={t('reimbursements.filters.settlementAll')}
              value={
                controller.filters.hasSettlement === undefined
                  ? ''
                  : String(controller.filters.hasSettlement)
              }
            />
          </label>

          <label className={styles.field}>
            {t('reimbursements.filters.search')}
            <input
              onChange={(event) =>
                controller.setFilters(
                  withFilter(
                    controller.filters,
                    'search',
                    event.target.value === '' ? undefined : event.target.value,
                  ),
                )
              }
              placeholder={t('reimbursements.filters.search')}
              type="text"
              value={controller.filters.search ?? ''}
            />
          </label>
        </div>

        {controller.isLoading ? (
          <SkeletonGroup label={t('reimbursements.loading')}>
            <Skeleton height="2.5rem" />
            <Skeleton height="2.5rem" />
          </SkeletonGroup>
        ) : rows.length === 0 ? (
          <p className={styles.hint}>{t('reimbursements.empty')}</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">
                  <Checkbox
                    ariaLabel={t('reimbursements.table.selectAll')}
                    checked={rows.every((row) => controller.selectedIds.has(row.id))}
                    indeterminate={
                      rows.some((row) => controller.selectedIds.has(row.id)) &&
                      !rows.every((row) => controller.selectedIds.has(row.id))
                    }
                    onChange={() => rows.forEach((row) => controller.toggleRow(row.id))}
                  />
                </th>
                <th scope="col">{t('reimbursements.table.date')}</th>
                <th scope="col">{t('reimbursements.table.note')}</th>
                <th scope="col">{t('reimbursements.table.type')}</th>
                <th scope="col">{t('reimbursements.table.amount')}</th>
                <th scope="col">{t('reimbursements.table.status')}</th>
                <th scope="col">{t('reimbursements.table.settlement')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Checkbox
                      ariaLabel={t('reimbursements.table.select')}
                      checked={controller.selectedIds.has(row.id)}
                      onChange={() => controller.toggleRow(row.id)}
                    />
                  </td>
                  <td>{row.chargedOn}</td>
                  <td>
                    {row.noteNumber === null
                      ? '—'
                      : row.noteSeries === null
                        ? row.noteNumber
                        : `${row.noteNumber}/${row.noteSeries}`}
                  </td>
                  <td>{t(`chargeType.${row.chargeType}`)}</td>
                  <td>{formatAmount(row.amount)}</td>
                  <td>{t(`chargeStatus.${row.status}`)}</td>
                  <td>
                    {row.hasSettlement
                      ? t('reimbursements.table.settlementDone')
                      : t('reimbursements.table.settlementPending')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {controller.report === undefined ? null : (
          <p className={styles.total}>
            {t('reimbursements.totals.reportTotal', {
              total: formatAmount(controller.report.totals.totalAmount),
            })}
          </p>
        )}
        <p className={styles.total}>
          {t('reimbursements.totals.selectedTotal', {
            count: controller.selectedIds.size,
            total: formatAmount(selectedTotal),
          })}
        </p>

        <p className={styles.hint}>{t('reimbursements.close.hint')}</p>
        {period === undefined || typeof period !== 'string' ? null : (
          <p className={styles.error} role="alert">
            {t(
              `reimbursements.close.${
                period === SELECTION_PERIOD_ERROR.EMPTY
                  ? 'emptyError'
                  : period === SELECTION_PERIOD_ERROR.MIXED_CONTRACTOR
                    ? 'mixedContractorError'
                    : 'missingContractorError'
              }`,
            )}
          </p>
        )}
        <Button
          disabled={controller.isClosing || period === undefined || typeof period === 'string'}
          onClick={() => void controller.closeSelection()}
          type="button"
        >
          <Icon name="send" />
          {t('reimbursements.close.action')}
        </Button>

        {controller.closedBatch === undefined ? null : (
          <div className={styles.report}>
            <p>
              {t('reimbursements.close.result', {
                contractor: controller.closedBatch.contractorId,
                periodEnd: controller.closedBatch.periodEnd,
                periodStart: controller.closedBatch.periodStart,
              })}
            </p>
            <Button
              disabled={controller.isDownloading}
              onClick={() => void controller.downloadStatement()}
              type="button"
              variant="secondary"
            >
              <Icon name="download" />
              {t('reimbursements.statement.action')}
            </Button>
            <p className={styles.hint}>{t('reimbursements.statement.hint')}</p>
          </div>
        )}
      </section>
    </main>
  )
}
