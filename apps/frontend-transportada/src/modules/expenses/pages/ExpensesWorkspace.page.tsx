/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { formatAmount } from '@/modules/shared/decimalAmount.service'

import { ExpenseCreateDialog } from '../components/ExpenseCreateDialog.component'
import { ExpenseSettleDialog } from '../components/ExpenseSettleDialog.component'
import { ExpenseTripsDialog } from '../components/ExpenseTripsDialog.component'
import { useExpensesWorkspace } from '../hooks/useExpensesWorkspace.hook'
import {
  EXPENSE_KINDS,
  EXPENSE_OCCURRENCE_STATUSES,
  type ExpenseOccurrenceListItem,
} from '../shared/expenses.types'
import {
  formatCivilDate,
  isOverdue,
  listCompetenceOptions,
  resolveOccurrencePayeeKey,
} from '../shared/expensesView.service'
import styles from '../styles/expenses.module.css'

/** Spec 325 T2.2 (RF8): "Contas" — o que a empresa paga, com filtros, totais, baixa e viagens. */
export function ExpensesWorkspacePage() {
  const { t } = useTranslation('expenses')
  const workspace = useExpensesWorkspace()
  const { canManage, filters, page, summary, today } = workspace

  if (workspace.isAuthLoading) {
    return (
      <main className={styles.shell}>
        <SkeletonGroup label={t('loading')}>
          <Skeleton height="2.5rem" />
        </SkeletonGroup>
      </main>
    )
  }

  if (!workspace.canRead) {
    return (
      <main className={styles.shell}>
        <header className={styles.header}>
          <h1>{t('title')}</h1>
        </header>
        <p className={styles.error} role="alert">
          {t('forbidden')}
        </p>
      </main>
    )
  }

  const driverOptions = workspace.driverOptions.drivers.map((driver) => ({
    label: driver.name,
    value: driver.id,
  }))

  function renderStatus(row: ExpenseOccurrenceListItem) {
    if (isOverdue(row, today)) return <Badge variant="warning">{t('status.overdue')}</Badge>
    const variant =
      row.status === 'paid' ? 'success' : row.status === 'canceled' ? 'info' : 'secondary'
    return <Badge variant={variant}>{t(`status.${row.status}`)}</Badge>
  }

  function renderPayee(row: ExpenseOccurrenceListItem) {
    const key = resolveOccurrencePayeeKey(row)
    if (row.payeeDriverName === null || key === null) return null
    return (
      <span className={styles.rowDetail}>
        {row.payeeDriverName} · {t(`payee.${key}`)}
      </span>
    )
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.panelHead}>
          <h1>{t('title')}</h1>
          <Button
            onClick={() => {
              window.history.pushState({}, '', '/contas/resultado')
              window.dispatchEvent(new PopStateEvent('popstate'))
            }}
            size="sm"
            type="button"
            variant="secondary"
          >
            {t('resultPage.open')}
          </Button>
        </div>
        <p className={styles.hint}>{t('subtitle')}</p>
      </header>

      <section aria-label={t('filters.title')} className={styles.filters}>
        <div className={styles.field}>
          <span>{t('filters.month')}</span>
          <Select
            ariaLabel={t('filters.month')}
            onChange={(value) => workspace.setFilter('competence', value)}
            options={listCompetenceOptions()}
            value={filters.competence}
          />
        </div>
        <div className={styles.field}>
          <span>{t('filters.kind')}</span>
          <Select
            ariaLabel={t('filters.kind')}
            clearable
            onChange={(value) => workspace.setFilter('kind', value as typeof filters.kind)}
            options={EXPENSE_KINDS.map((kind) => ({ label: t(`kind.${kind}`), value: kind }))}
            placeholder={t('filters.all')}
            value={filters.kind}
          />
        </div>
        <div className={styles.field}>
          <span>{t('filters.category')}</span>
          <Select
            ariaLabel={t('filters.category')}
            clearable
            onChange={(value) => workspace.setFilter('categoryId', value)}
            options={workspace.categories.map((category) => ({
              label: category.name,
              value: category.id,
            }))}
            placeholder={t('filters.allFeminine')}
            value={filters.categoryId}
          />
        </div>
        <div className={styles.field}>
          <span>{t('filters.status')}</span>
          <Select
            ariaLabel={t('filters.status')}
            clearable
            onChange={(value) => workspace.setFilter('status', value as typeof filters.status)}
            options={EXPENSE_OCCURRENCE_STATUSES.map((status) => ({
              label: t(`status.${status}`),
              value: status,
            }))}
            placeholder={t('filters.all')}
            value={filters.status}
          />
        </div>
        <div className={styles.field}>
          <span>{t('filters.payee')}</span>
          <Select
            ariaLabel={t('filters.payee')}
            clearable
            onChange={(value) => workspace.setFilter('driverId', value)}
            options={driverOptions}
            placeholder={t('filters.all')}
            value={filters.driverId}
          />
        </div>
      </section>

      {workspace.loadError === null ? null : (
        <p className={styles.error} role="alert">
          {t(`errors.${workspace.loadError.message}`, { defaultValue: t('errors.REQUEST_FAILED') })}
        </p>
      )}

      {summary === undefined ? null : (
        <dl className={styles.totals}>
          <div>
            <dt>{t('totals.expected')}</dt>
            <dd>{formatAmount(summary.expected)}</dd>
          </div>
          <div>
            <dt>{t('totals.paid')}</dt>
            <dd className={styles.amountIn}>{formatAmount(summary.paid)}</dd>
          </div>
          <div>
            <dt>{t('totals.open')}</dt>
            <dd>{formatAmount(summary.open)}</dd>
          </div>
          <div>
            <dt>{t('totals.overdue')}</dt>
            <dd className={summary.overdueCount > 0 ? styles.amountOut : undefined}>
              {summary.overdueCount} · {formatAmount(summary.overdueAmount)}
            </dd>
          </div>
        </dl>
      )}

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2>{t('list.title')}</h2>
          {canManage ? (
            <Button onClick={() => workspace.openDialog({ kind: 'create' })} type="button">
              <Icon name="money" />
              {t('list.new')}
            </Button>
          ) : null}
        </div>

        {workspace.isLoading ? (
          <SkeletonGroup label={t('loading')}>
            <Skeleton height="2.5rem" />
            <Skeleton height="2.5rem" />
            <Skeleton height="2.5rem" />
          </SkeletonGroup>
        ) : page === undefined || page.items.length === 0 ? (
          <p className={styles.hint}>{t('list.empty')}</p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">{t('list.account')}</th>
                  <th scope="col">{t('list.kind')}</th>
                  <th scope="col">{t('list.category')}</th>
                  <th scope="col">{t('list.due')}</th>
                  <th scope="col">{t('list.expected')}</th>
                  <th scope="col">{t('list.paid')}</th>
                  <th scope="col">{t('list.status')}</th>
                  <th scope="col">
                    <span className={styles.srOnly}>{t('list.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {page.items.map((row) => (
                  <tr key={row.id}>
                    <td data-column={t('list.account')}>
                      <div>
                        {row.expenseName}
                        {renderPayee(row)}
                      </div>
                    </td>
                    <td data-column={t('list.kind')}>{t(`kind.${row.expenseKind}`)}</td>
                    <td data-column={t('list.category')}>{row.categoryName}</td>
                    <td data-column={t('list.due')}>{formatCivilDate(row.dueDate)}</td>
                    <td data-column={t('list.expected')}>{formatAmount(row.expectedAmount)}</td>
                    <td data-column={t('list.paid')}>
                      {row.paidAmount === null ? '—' : formatAmount(row.paidAmount)}
                    </td>
                    <td data-column={t('list.status')}>{renderStatus(row)}</td>
                    <td>
                      <div className={styles.rowActions}>
                        {row.payeeDriverId === null ? null : (
                          <Button
                            onClick={() => workspace.openDialog({ kind: 'trips', occurrence: row })}
                            size="sm"
                            type="button"
                            variant="secondary"
                          >
                            {t('list.trips')}
                          </Button>
                        )}
                        {canManage && row.status === 'open' ? (
                          <Button
                            onClick={() =>
                              workspace.openDialog({ kind: 'settle', occurrence: row })
                            }
                            size="sm"
                            type="button"
                            variant="secondary"
                          >
                            {t('list.settle')}
                          </Button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {page === undefined || page.totals.paidByDriver.length === 0 ? null : (
          <div className={styles.paidByDriver}>
            <h3>{t('totals.paidByDriver')}</h3>
            <ul>
              {page.totals.paidByDriver.map((entry) => (
                <li key={entry.driverId}>
                  {entry.driverName ?? entry.driverId} · {formatAmount(entry.paidAmount)}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {workspace.dialog?.kind === 'create' ? (
        <ExpenseCreateDialog
          categories={workspace.categories}
          driverOptions={driverOptions}
          onClose={workspace.closeDialog}
          vehicleOptions={workspace.vehicleOptions}
        />
      ) : null}
      {workspace.dialog?.kind === 'settle' ? (
        <ExpenseSettleDialog
          occurrence={workspace.dialog.occurrence}
          onClose={workspace.closeDialog}
        />
      ) : null}
      {workspace.dialog?.kind === 'trips' ? (
        <ExpenseTripsDialog
          canManage={canManage}
          occurrence={workspace.dialog.occurrence}
          onClose={workspace.closeDialog}
        />
      ) : null}
    </main>
  )
}
