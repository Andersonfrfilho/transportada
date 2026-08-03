/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Fragment, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Icon } from '@/components/ui/icon'
import { Select, type SelectOption } from '@/components/ui/select'

import type { BillingEligibleTableController } from '../hooks/useBillingEligibleTable.hook'
import {
  applyBillingEligibleConditionChanges,
  BILLING_ELIGIBLE_CONDITION_FIELDS,
  BILLING_ELIGIBLE_CONDITION_FIELD_TYPE,
  BILLING_ELIGIBLE_OPERATORS_BY_TYPE,
  createBillingEligibleCondition,
  createBillingEligibleConditionGroup,
  type BillingEligibleAdvancedFilter,
  type BillingEligibleCondition,
  type BillingEligibleConditionField,
  type BillingEligibleConditionGroup,
} from '../shared/billingEligibleAdvancedFilter.service'
import type { BillingEligibleTableFilters } from '../shared/billingEligibleTable.service'
import styles from '../styles/billingEligibleTable.module.css'

const TEXT_FILTER_FIELDS: readonly (keyof BillingEligibleTableFilters)[] = [
  'batchId',
  'cteNumberQuery',
  'nfeNumberQuery',
  'customerName',
  'customerDocument',
  'minAmount',
  'maxAmount',
]

/** Só os campos cuja sintaxe não é óbvia ganham exemplo dentro do próprio campo. */
const FIELD_PLACEHOLDER_KEYS: Readonly<Record<string, true>> = {
  cteNumberQuery: true,
  nfeNumberQuery: true,
}

type BillingEligibleFiltersProps = Readonly<{
  table: BillingEligibleTableController
}>

function replaceGroup(
  model: BillingEligibleAdvancedFilter,
  groupId: string,
  replace: (group: BillingEligibleConditionGroup) => BillingEligibleConditionGroup,
): BillingEligibleAdvancedFilter {
  return {
    ...model,
    groups: model.groups.map((group) => (group.id === groupId ? replace(group) : group)),
  }
}

function toggleConnector(connector: 'and' | 'or'): 'and' | 'or' {
  return connector === 'and' ? 'or' : 'and'
}

export function BillingEligibleFilters({ table }: BillingEligibleFiltersProps): JSX.Element {
  const { t } = useTranslation('billingWorkspace')

  const model = table.advancedFilter
  const connectorLabels: Record<'and' | 'or', string> = {
    and: t('eligible.advanced.connectorAnd'),
    or: t('eligible.advanced.connectorOr'),
  }
  const fieldOptions: readonly SelectOption[] = BILLING_ELIGIBLE_CONDITION_FIELDS.map((field) => ({
    label: t(`eligible.columns.${field}`),
    value: field,
  }))

  function updateCondition(
    groupId: string,
    conditionId: string,
    changes: Readonly<Partial<BillingEligibleCondition>>,
  ): void {
    table.setAdvancedFilter(
      replaceGroup(model, groupId, (group) => ({
        ...group,
        conditions: group.conditions.map((condition) =>
          condition.id === conditionId
            ? applyBillingEligibleConditionChanges(condition, changes)
            : condition,
        ),
      })),
    )
  }

  function renderValue(
    group: BillingEligibleConditionGroup,
    condition: BillingEligibleCondition,
  ): JSX.Element {
    const type = BILLING_ELIGIBLE_CONDITION_FIELD_TYPE[condition.field]
    if (type === 'date') {
      const isRange = condition.operator === 'between'
      return (
        <DateRangePicker
          ariaLabel={t('eligible.advanced.value')}
          clearLabel={t('dateRange.clear')}
          from={condition.value}
          nextMonthLabel={t('dateRange.nextMonth')}
          onChange={(from, to) =>
            updateCondition(group.id, condition.id, {
              value: from,
              valueTo: isRange ? to : '',
            })
          }
          placeholder={t('dateRange.placeholder')}
          previousMonthLabel={t('dateRange.previousMonth')}
          to={isRange ? condition.valueTo : ''}
        />
      )
    }
    return (
      <span className={styles.builderValues}>
        <input
          aria-label={t('eligible.advanced.value')}
          inputMode={type === 'text' ? undefined : 'decimal'}
          onChange={(event) =>
            updateCondition(group.id, condition.id, { value: event.target.value })
          }
          placeholder={t('eligible.advanced.value')}
          type="text"
          value={condition.value}
        />
        {condition.operator === 'between' ? (
          <input
            aria-label={t('eligible.advanced.valueTo')}
            inputMode="decimal"
            onChange={(event) =>
              updateCondition(group.id, condition.id, { valueTo: event.target.value })
            }
            placeholder={t('eligible.advanced.valueTo')}
            type="text"
            value={condition.valueTo}
          />
        ) : null}
      </span>
    )
  }

  function renderCondition(
    group: BillingEligibleConditionGroup,
    condition: BillingEligibleCondition,
  ): JSX.Element {
    const type = BILLING_ELIGIBLE_CONDITION_FIELD_TYPE[condition.field]
    const operatorOptions: readonly SelectOption[] = BILLING_ELIGIBLE_OPERATORS_BY_TYPE[type].map(
      (operator) => ({ label: t(`eligible.advanced.operators.${operator}`), value: operator }),
    )
    return (
      <div className={styles.builderCondition}>
        <Select
          ariaLabel={t('eligible.advanced.field')}
          compact
          onChange={(value) =>
            updateCondition(group.id, condition.id, {
              field: value as BillingEligibleConditionField,
            })
          }
          options={fieldOptions}
          placeholder={t('eligible.advanced.field')}
          value={condition.field}
        />
        <Select
          ariaLabel={t('eligible.advanced.operator')}
          compact
          onChange={(value) =>
            updateCondition(group.id, condition.id, {
              operator: value as BillingEligibleCondition['operator'],
            })
          }
          options={operatorOptions}
          placeholder={t('eligible.advanced.operator')}
          value={condition.operator}
        />
        {renderValue(group, condition)}
        <button
          aria-label={t('eligible.advanced.removeCondition')}
          className={styles.builderAction}
          disabled={group.conditions.length <= 1}
          onClick={() =>
            table.setAdvancedFilter(
              replaceGroup(model, group.id, (current) => ({
                ...current,
                conditions: current.conditions.filter((item) => item.id !== condition.id),
              })),
            )
          }
          type="button"
        >
          <Icon name="remove" />
          {t('eligible.advanced.removeCondition')}
        </button>
      </div>
    )
  }

  function renderGroup(group: BillingEligibleConditionGroup, index: number): JSX.Element {
    return (
      <Fragment key={group.id}>
        {index > 0 ? (
          <div className={styles.builderConnectorRow}>
            <span className={styles.builderConnectorLine} />
            <button
              className={styles.builderConnectorChip}
              onClick={() =>
                table.setAdvancedFilter({ ...model, connector: toggleConnector(model.connector) })
              }
              type="button"
            >
              {connectorLabels[model.connector]}
            </button>
            <span className={styles.builderConnectorLine} />
          </div>
        ) : null}
        <div className={styles.builderGroup}>
          <div className={styles.builderGroupHeader}>
            <span>{t('eligible.advanced.title')}</span>
            <button
              className={styles.builderAction}
              disabled={model.groups.length <= 1}
              onClick={() =>
                table.setAdvancedFilter({
                  ...model,
                  groups: model.groups.filter((item) => item.id !== group.id),
                })
              }
              type="button"
            >
              <Icon name="trash" />
              {t('eligible.advanced.removeGroup')}
            </button>
          </div>
          <div className={styles.builderConditions}>
            {group.conditions.map((condition, conditionIndex) => (
              <Fragment key={condition.id}>
                {conditionIndex > 0 ? (
                  <div className={styles.builderConnectorRow}>
                    <span className={styles.builderConnectorLine} />
                    <button
                      className={styles.builderConnectorChip}
                      onClick={() =>
                        table.setAdvancedFilter(
                          replaceGroup(model, group.id, (current) => ({
                            ...current,
                            connector: toggleConnector(current.connector),
                          })),
                        )
                      }
                      type="button"
                    >
                      {connectorLabels[group.connector]}
                    </button>
                    <span className={styles.builderConnectorLine} />
                  </div>
                ) : null}
                {renderCondition(group, condition)}
              </Fragment>
            ))}
          </div>
          <button
            className={styles.builderAction}
            onClick={() =>
              table.setAdvancedFilter(
                replaceGroup(model, group.id, (current) => ({
                  ...current,
                  conditions: [
                    ...current.conditions,
                    createBillingEligibleCondition(table.nextConditionId()),
                  ],
                })),
              )
            }
            type="button"
          >
            <Icon name="add" />
            {t('eligible.advanced.addCondition')}
          </button>
        </div>
      </Fragment>
    )
  }

  return (
    <div className={styles.filterPanel}>
      <div className={styles.fieldGrid}>
        {TEXT_FILTER_FIELDS.map((field) => {
          const error = table.filterErrors[field]
          return (
            <label key={field}>
              <span>{t(`eligible.filters.${field}`)}</span>
              <input
                aria-invalid={error !== undefined}
                onChange={(event) => table.setTextFilter(field, event.target.value)}
                placeholder={
                  field in FIELD_PLACEHOLDER_KEYS ? t(`eligible.filters.hints.${field}`) : undefined
                }
                type="text"
                value={table.filters[field]}
              />
              {error === undefined ? null : (
                <span className={styles.fieldError} role="alert">
                  {t(`eligible.filters.errors.${error}`)}
                </span>
              )}
            </label>
          )
        })}
        <label>
          <span>{t('eligible.filters.issuedRange')}</span>
          <DateRangePicker
            ariaLabel={t('eligible.filters.issuedRange')}
            clearLabel={t('dateRange.clear')}
            from={table.filters.issuedFrom}
            nextMonthLabel={t('dateRange.nextMonth')}
            onChange={(from, to) => {
              table.setTextFilter('issuedFrom', from)
              table.setTextFilter('issuedTo', to)
            }}
            placeholder={t('dateRange.placeholder')}
            previousMonthLabel={t('dateRange.previousMonth')}
            to={table.filters.issuedTo}
          />
        </label>
      </div>
      <div className={styles.builder}>
        {model.groups.map((group, index) => renderGroup(group, index))}
        <button
          className={styles.builderAction}
          onClick={() =>
            table.setAdvancedFilter({
              ...model,
              groups: [...model.groups, createBillingEligibleConditionGroup(table.nextConditionId)],
            })
          }
          type="button"
        >
          <Icon name="add" />
          {t('eligible.advanced.addGroup')}
        </button>
      </div>
    </div>
  )
}
