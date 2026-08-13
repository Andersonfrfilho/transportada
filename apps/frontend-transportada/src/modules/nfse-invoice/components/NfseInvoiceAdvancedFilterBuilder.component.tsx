/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Fragment, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Icon } from '@/components/ui/icon'
import { Select, type SelectOption } from '@/components/ui/select'

import type { NfseAdvancedFilterControls } from '../hooks/useNfseAdvancedFilter.hook'
import { NFSE_INVOICE_STATUSES } from '../shared/nfseInvoice.types'
import {
  NFSE_INVOICE_CONDITION_FIELD_TYPE,
  NFSE_INVOICE_CONDITION_FIELDS,
  operatorsForNfseField,
  type NfseCondition,
  type NfseConditionGroup,
  type NfseConditionOperator,
  type NfseInvoiceConditionField,
} from '../shared/nfseInvoiceAdvancedFilter.service'
import styles from '../styles/nfseInvoice.module.css'

type NfseInvoiceAdvancedFilterBuilderProps = Readonly<{
  controls: NfseAdvancedFilterControls
}>

type ConnectorRailProps = Readonly<{
  hint: string
  label: string
  onToggle: () => void
}>

function oppositeConnector(current: 'and' | 'or'): 'and' | 'or' {
  return current === 'and' ? 'or' : 'and'
}

function ConnectorRail({ hint, label, onToggle }: ConnectorRailProps): JSX.Element {
  return (
    <div className={styles.connectorRail}>
      <span aria-hidden="true" className={styles.connectorLine} />
      <button
        aria-label={hint}
        className={styles.connectorChip}
        onClick={onToggle}
        title={hint}
        type="button"
      >
        {label}
      </button>
      <span aria-hidden="true" className={styles.connectorLine} />
    </div>
  )
}

export function NfseInvoiceAdvancedFilterBuilder({
  controls,
}: NfseInvoiceAdvancedFilterBuilderProps): JSX.Element {
  const { t } = useTranslation('nfseInvoice')
  const model = controls.model

  const connectorLabel: Readonly<Record<'and' | 'or', string>> = {
    and: t('connector.and'),
    or: t('connector.or'),
  }

  const fieldOptions: readonly SelectOption[] = NFSE_INVOICE_CONDITION_FIELDS.map((field) => ({
    label: t(`field.${field}`),
    value: field,
  }))

  const statusOptions: readonly SelectOption[] = NFSE_INVOICE_STATUSES.map((status) => ({
    label: t(`status.${status}`),
    value: status,
  }))

  function renderValue(group: NfseConditionGroup, condition: NfseCondition): JSX.Element {
    const type = NFSE_INVOICE_CONDITION_FIELD_TYPE[condition.field]

    if (type === 'option') {
      return (
        <Select
          ariaLabel={t('advanced.value')}
          clearable={false}
          compact
          onChange={(value) => controls.changeCondition(group.id, condition.id, { value })}
          options={statusOptions}
          placeholder={t('advanced.value')}
          value={condition.value}
        />
      )
    }

    if (type === 'date' && condition.operator === 'between') {
      return (
        <DateRangePicker
          ariaLabel={t('advanced.value')}
          clearLabel={t('dateRange.clear')}
          from={condition.value}
          nextMonthLabel={t('dateRange.nextMonth')}
          onChange={(from, to) =>
            controls.changeCondition(group.id, condition.id, { value: from, valueTo: to })
          }
          placeholder={t('dateRange.placeholder')}
          previousMonthLabel={t('dateRange.previousMonth')}
          to={condition.valueTo}
        />
      )
    }

    return (
      <input
        aria-label={t('advanced.value')}
        inputMode={type === 'number' ? 'decimal' : undefined}
        onChange={(event) =>
          controls.changeCondition(group.id, condition.id, { value: event.target.value })
        }
        placeholder={t('advanced.value')}
        type={type === 'date' ? 'date' : 'text'}
        value={condition.value}
      />
    )
  }

  function renderCondition(group: NfseConditionGroup, condition: NfseCondition): JSX.Element {
    const operatorOptions: readonly SelectOption[] = operatorsForNfseField(condition.field).map(
      (operator) => ({ label: t(`operator.${operator}`), value: operator }),
    )

    return (
      <div className={styles.conditionRow}>
        <Select
          ariaLabel={t('advanced.field')}
          clearable={false}
          compact
          onChange={(value) =>
            controls.changeCondition(group.id, condition.id, {
              field: value as NfseInvoiceConditionField,
            })
          }
          options={fieldOptions}
          placeholder={t('advanced.field')}
          value={condition.field}
        />
        <Select
          ariaLabel={t('advanced.operator')}
          clearable={false}
          compact
          onChange={(value) =>
            controls.changeCondition(group.id, condition.id, {
              operator: value as NfseConditionOperator,
            })
          }
          options={operatorOptions}
          placeholder={t('advanced.operator')}
          value={condition.operator}
        />
        {renderValue(group, condition)}
        <button
          aria-label={t('advanced.removeCondition')}
          className={styles.iconAction}
          disabled={group.conditions.length <= 1}
          onClick={() => controls.removeGroupCondition(group.id, condition.id)}
          title={t('advanced.removeCondition')}
          type="button"
        >
          <Icon name="remove" />
        </button>
      </div>
    )
  }

  function renderGroup(group: NfseConditionGroup, groupIndex: number): JSX.Element {
    return (
      <Fragment key={group.id}>
        {groupIndex > 0 ? (
          <ConnectorRail
            hint={t('advanced.rootConnector')}
            label={connectorLabel[model.connector]}
            onToggle={() => controls.setModelConnector(oppositeConnector(model.connector))}
          />
        ) : null}
        <div className={styles.conditionGroup}>
          <div className={styles.conditionGroupHeader}>
            <span className={styles.conditionGroupTitle}>
              {t('advanced.groupTitle', { index: groupIndex + 1 })}
            </span>
            <button
              aria-label={t('advanced.removeGroup')}
              className={styles.iconAction}
              disabled={model.groups.length <= 1}
              onClick={() => controls.removeConditionGroup(group.id)}
              title={t('advanced.removeGroup')}
              type="button"
            >
              <Icon name="remove" />
            </button>
          </div>
          <div className={styles.conditionList}>
            {group.conditions.map((condition, conditionIndex) => (
              <Fragment key={condition.id}>
                {conditionIndex > 0 ? (
                  <ConnectorRail
                    hint={t('advanced.groupConnector')}
                    label={connectorLabel[group.connector]}
                    onToggle={() =>
                      controls.setGroupConnector(group.id, oppositeConnector(group.connector))
                    }
                  />
                ) : null}
                {renderCondition(group, condition)}
              </Fragment>
            ))}
          </div>
          <button
            className={styles.builderAction}
            onClick={() => controls.addGroupCondition(group.id)}
            type="button"
          >
            <Icon name="add" />
            <span>{t('advanced.addCondition')}</span>
          </button>
        </div>
      </Fragment>
    )
  }

  return (
    <div className={styles.builder}>
      <p className={styles.hint}>{t('advanced.hint')}</p>
      {model.groups.map((group, groupIndex) => renderGroup(group, groupIndex))}
      <button
        className={styles.builderAction}
        onClick={() => controls.addConditionGroup()}
        type="button"
      >
        <Icon name="add" />
        <span>{t('advanced.addGroup')}</span>
      </button>
    </div>
  )
}
