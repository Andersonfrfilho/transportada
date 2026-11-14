/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 325 T5.3 (RF16): o painel "Rateio das contas". Diz em qual grupo de custo cada categoria cai (fixo do veículo,
 * variável por km, administrativo) e como cada grupo é dividido entre as viagens, e ajusta o limite do "fora do padrão".
 * Autocontido: busca os próprios dados pelo módulo `expenses`. Lê com `expenses.read`; grava com `expenses.manage`.
 */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import type { ExpenseCostGroup } from '@/modules/expenses/shared/expenses.types'
import {
  EXPENSE_ALLOCATABLE_GROUPS,
  EXPENSE_ALLOCATION_CRITERIA,
  type ExpenseAllocatableGroup,
  type ExpenseAllocationCriterion,
} from '@/modules/expenses/shared/expensesResult.types'

import { useExpenseAllocationPanel } from '../hooks/useExpenseAllocationPanel.hook'
import { formatThresholdPercent, groupChoicesOf } from '../shared/expenseAllocationForm.service'
import styles from '../styles/businessCalendar.module.css'
import allocationStyles from '../styles/expenseAllocation.module.css'

export type ExpenseAllocationPanelProps = Readonly<{
  /** `expenses.manage`: sem ela o painel só mostra o que está gravado. */
  canManage: boolean
  /** `expenses.read`: sem ela as consultas não sobem (a API recusaria). */
  canRead: boolean
}>

/** O critério "por km" no grupo variável é o custo por km do veículo; nos outros é o quilômetro rodado no mês. */
export function criterionLabelKey(
  input: Readonly<{ criterion: ExpenseAllocationCriterion; group: ExpenseAllocatableGroup }>,
): string {
  return input.criterion === 'per_km' && input.group === 'per_km'
    ? 'expenseAllocation.criterion.per_km_variable'
    : `expenseAllocation.criterion.${input.criterion}`
}

export function ExpenseAllocationPanel({ canManage, canRead }: ExpenseAllocationPanelProps) {
  const { t } = useTranslation('companySettings')
  const titleId = useId()
  const thresholdId = useId()
  const panel = useExpenseAllocationPanel({ canRead })

  if (!canRead) return null

  const { categories, draft, storedCriteria, storedThreshold } = panel
  const changed =
    panel.changes !== null &&
    (panel.changes.threshold !== null ||
      panel.changes.categoryGroups.length > 0 ||
      Object.keys(panel.changes.criteria).length > 0)

  return (
    <section aria-labelledby={titleId} className={styles.panel}>
      <div className={styles.panelHeading}>
        <h2 id={titleId}>{t('expenseAllocation.title')}</h2>
        <p className={styles.hint}>{t('expenseAllocation.subtitle')}</p>
      </div>

      {panel.pending ? (
        <SkeletonGroup label={t('expenseAllocation.loading')}>
          <Skeleton height="var(--field-height)" width="100%" />
          <Skeleton height="var(--field-height)" width="100%" />
        </SkeletonGroup>
      ) : null}
      {panel.loadFailed ? (
        <div className={styles.block}>
          <p className={styles.hint} role="alert">
            {t('expenseAllocation.error.loadFailed')}
          </p>
          <Button onClick={panel.reload} type="button" variant="secondary">
            <Icon name="refresh" />
            {t('expenseAllocation.retry')}
          </Button>
        </div>
      ) : null}

      {categories === undefined ||
      storedCriteria === undefined ||
      storedThreshold === undefined ? null : (
        <>
          <section className={styles.block}>
            <h3>{t('expenseAllocation.criteria.title')}</h3>
            <div className={styles.fieldGrid}>
              {EXPENSE_ALLOCATABLE_GROUPS.map((group) => (
                <label className={styles.field} key={group}>
                  <span className={styles.fieldLabel}>{t(`expenseAllocation.group.${group}`)}</span>
                  <Select
                    ariaLabel={t(`expenseAllocation.group.${group}`)}
                    disabled={!canManage || panel.saving}
                    onChange={(value) => {
                      const criterion = EXPENSE_ALLOCATION_CRITERIA.find((item) => item === value)
                      if (criterion !== undefined) panel.setCriterion(group, criterion)
                    }}
                    options={EXPENSE_ALLOCATION_CRITERIA.map((criterion) => ({
                      label: t(criterionLabelKey({ criterion, group })),
                      value: criterion,
                    }))}
                    value={draft.criteria[group] ?? storedCriteria[group]}
                  />
                </label>
              ))}
            </div>
            <p className={styles.hint}>{t('expenseAllocation.criteria.hint')}</p>
          </section>

          <section className={styles.block}>
            <h3>{t('expenseAllocation.threshold.title')}</h3>
            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor={thresholdId}>
                  {t('expenseAllocation.threshold.label')}
                </label>
                <input
                  aria-invalid={panel.thresholdInvalid}
                  className={styles.input}
                  disabled={!canManage || panel.saving}
                  id={thresholdId}
                  inputMode="decimal"
                  onChange={(event) => panel.setThreshold(event.target.value)}
                  value={draft.threshold ?? formatThresholdPercent(storedThreshold)}
                />
                {panel.thresholdInvalid ? (
                  <p className={styles.fieldError} role="alert">
                    {t('expenseAllocation.threshold.invalid')}
                  </p>
                ) : null}
              </div>
            </div>
            <p className={styles.hint}>{t('expenseAllocation.threshold.hint')}</p>
          </section>

          <section className={styles.block}>
            <h3>{t('expenseAllocation.categories.title')}</h3>
            {categories.length === 0 ? (
              <p className={styles.hint}>{t('expenseAllocation.categories.empty')}</p>
            ) : (
              <ul className={allocationStyles.rows}>
                {categories.map((category) => {
                  const value: ExpenseCostGroup =
                    draft.categoryGroups[category.id] ?? category.costGroup
                  const choices = groupChoicesOf(category)
                  return (
                    <li className={allocationStyles.row} key={category.id}>
                      <span className={allocationStyles.name}>
                        {category.name}
                        {category.active ? null : (
                          <span className={styles.hint}> · {t('expenseAllocation.inactive')}</span>
                        )}
                      </span>
                      <div className={styles.field}>
                        <Select
                          ariaLabel={t('expenseAllocation.categories.groupOf', {
                            name: category.name,
                          })}
                          disabled={!canManage || panel.saving || choices.length === 1}
                          onChange={(next) => {
                            const group = choices.find((item) => item === next)
                            if (group !== undefined) panel.setCategoryGroup(category.id, group)
                          }}
                          options={choices.map((group) => ({
                            label: t(`expenseAllocation.group.${group}`),
                            value: group,
                          }))}
                          value={value}
                        />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            <p className={styles.hint}>{t('expenseAllocation.categories.driverNote')}</p>
          </section>

          {canManage ? (
            <div className={styles.actions}>
              <Button
                disabled={!changed || panel.thresholdInvalid || panel.saving}
                onClick={() => void panel.save()}
                type="button"
              >
                <Icon name="save" />
                {panel.saving ? t('expenseAllocation.saving') : t('expenseAllocation.save')}
              </Button>
            </div>
          ) : null}
          {panel.saved ? (
            <p className={styles.hint} role="status">
              {t('expenseAllocation.saved')}
            </p>
          ) : null}
          {panel.failed ? (
            <p className={styles.hint} role="alert">
              {t('expenseAllocation.error.saveFailed')}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
