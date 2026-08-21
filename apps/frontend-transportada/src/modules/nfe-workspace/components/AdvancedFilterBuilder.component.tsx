/* Copyright (c) 2026 Ada Technology. MIT License. */
import { Fragment, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { DatePicker } from '@/components/ui/date-picker'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Icon } from '@/components/ui/icon'
import { Select, type SelectOption } from '@/components/ui/select'

import {
  CONDITION_FIELDS,
  CONDITION_FIELD_TYPE,
  OPERATORS_BY_TYPE,
  type AdvancedFilterModel,
  type ConditionChanges,
  type ConditionField,
  type FilterCondition,
  type FilterGroup,
  type GroupConnector,
} from '../hooks/useNfeDocumentTable.hook'
import styles from '../styles/nfeWorkspace.module.css'

type SelectFieldOptions = Readonly<{
  cteIssued: readonly SelectOption[]
  emitterCity: readonly SelectOption[]
  emitterState: readonly SelectOption[]
  recipientCity: readonly SelectOption[]
  recipientState: readonly SelectOption[]
  status: readonly SelectOption[]
}>

type AdvancedFilterBuilderProps = Readonly<{
  model: AdvancedFilterModel
  onAddCondition: (groupId: string) => void
  onAddGroup: () => void
  onRemoveCondition: (groupId: string, conditionId: string) => void
  onRemoveGroup: (groupId: string) => void
  onSetGroupConnector: (groupId: string, connector: GroupConnector) => void
  onSetRootConnector: (connector: GroupConnector) => void
  onUpdateCondition: (groupId: string, conditionId: string, changes: ConditionChanges) => void
  selectFieldOptions: SelectFieldOptions
}>

type ConnectorRailProps = Readonly<{
  hint: string
  label: string
  onToggle: () => void
  variant?: 'group' | 'root'
}>

function className(...names: readonly (string | undefined)[]): string {
  return names.filter((name) => name !== undefined && name.length > 0).join(' ')
}

function toggleConnector(current: GroupConnector): GroupConnector {
  return current === 'and' ? 'or' : 'and'
}

function ConnectorRail({
  hint,
  label,
  onToggle,
  variant = 'group',
}: ConnectorRailProps): JSX.Element {
  return (
    <div
      className={className(
        styles.builderConnectorRail,
        variant === 'root' ? styles.builderConnectorRailRoot : undefined,
      )}
    >
      <span className={styles.builderConnectorLine} />
      <button
        aria-label={hint}
        className={styles.builderConnectorChip}
        onClick={onToggle}
        title={hint}
        type="button"
      >
        {label}
      </button>
      <span className={styles.builderConnectorLine} />
    </div>
  )
}

export function AdvancedFilterBuilder({
  model,
  onAddCondition,
  onAddGroup,
  onRemoveCondition,
  onRemoveGroup,
  onSetGroupConnector,
  onSetRootConnector,
  onUpdateCondition,
  selectFieldOptions,
}: AdvancedFilterBuilderProps): JSX.Element {
  const { t } = useTranslation('nfeWorkspace')

  const connectorLabels: Record<GroupConnector, string> = {
    and: t('documents.connector.and'),
    or: t('documents.connector.or'),
  }

  const fieldOptions: readonly SelectOption[] = CONDITION_FIELDS.map((field) => ({
    label: t(`documents.fields.${field}`),
    value: field,
  }))

  function selectOptionsFor(field: ConditionField): readonly SelectOption[] {
    if (field === 'cteIssued') return selectFieldOptions.cteIssued
    if (field === 'status') return selectFieldOptions.status
    if (field === 'emitterCity') return selectFieldOptions.emitterCity
    if (field === 'emitterState') return selectFieldOptions.emitterState
    if (field === 'recipientCity') return selectFieldOptions.recipientCity
    if (field === 'recipientState') return selectFieldOptions.recipientState
    return []
  }

  function renderValue(group: FilterGroup, condition: FilterCondition): JSX.Element {
    const type = CONDITION_FIELD_TYPE[condition.field]
    if (type === 'select') {
      return (
        <Select
          ariaLabel={t('documents.builder.value')}
          clearable={false}
          emptyLabel={t('filters.searchEmpty')}
          onChange={(value) => onUpdateCondition(group.id, condition.id, { value })}
          options={selectOptionsFor(condition.field)}
          placeholder={t('filters.all')}
          searchPlaceholder={t('filters.search')}
          value={condition.value}
        />
      )
    }
    if (type === 'date') {
      if (condition.operator === 'between') {
        return (
          <DateRangePicker
            ariaLabel={t('documents.builder.value')}
            clearLabel={t('documents.clearAll')}
            from={condition.value}
            nextMonthLabel={t('documents.nextMonth')}
            onChange={(from, to) =>
              onUpdateCondition(group.id, condition.id, { value: from, valueTo: to })
            }
            placeholder={t('documents.datePlaceholder')}
            previousMonthLabel={t('documents.previousMonth')}
            to={condition.valueTo}
          />
        )
      }
      return (
        <DatePicker
          ariaLabel={t('documents.builder.value')}
          chooseYearLabel={t('documents.chooseYear')}
          clearLabel={t('documents.clearAll')}
          nextMonthLabel={t('documents.nextMonth')}
          openCalendarLabel={t('documents.openCalendar')}
          placeholder={t('documents.datePlaceholder')}
          previousMonthLabel={t('documents.previousMonth')}
          value={condition.value}
          onChange={(value) => onUpdateCondition(group.id, condition.id, { value })}
        />
      )
    }
    return (
      <input
        aria-label={t('documents.builder.value')}
        className={styles.filterInput}
        inputMode={type === 'text' ? undefined : 'decimal'}
        onChange={(event) =>
          onUpdateCondition(group.id, condition.id, { value: event.target.value })
        }
        placeholder={t('documents.builder.value')}
        type="text"
        value={condition.value}
      />
    )
  }

  function renderCondition(group: FilterGroup, condition: FilterCondition): JSX.Element {
    const type = CONDITION_FIELD_TYPE[condition.field]
    const operatorOptions: readonly SelectOption[] = OPERATORS_BY_TYPE[type].map((operator) => ({
      label: t(`documents.operators.${operator}`),
      value: operator,
    }))
    return (
      <div className={styles.builderCondition} key={condition.id}>
        <Select
          ariaLabel={t('documents.builder.field')}
          clearable={false}
          compact
          onChange={(value) =>
            onUpdateCondition(group.id, condition.id, { field: value as ConditionField })
          }
          options={fieldOptions}
          placeholder={t('documents.builder.field')}
          value={condition.field}
        />
        <Select
          ariaLabel={t('documents.builder.operator')}
          clearable={false}
          compact
          onChange={(value) =>
            onUpdateCondition(group.id, condition.id, {
              operator: value as FilterCondition['operator'],
            })
          }
          options={operatorOptions}
          placeholder={t('documents.builder.operator')}
          value={condition.operator}
        />
        {renderValue(group, condition)}
        <button
          aria-label={t('documents.builder.removeCondition')}
          className={styles.iconAction}
          disabled={group.conditions.length <= 1}
          onClick={() => onRemoveCondition(group.id, condition.id)}
          title={t('documents.builder.removeCondition')}
          type="button"
        >
          <Icon name="remove" />
        </button>
      </div>
    )
  }

  function renderGroup(group: FilterGroup, index: number): JSX.Element {
    return (
      <Fragment key={group.id}>
        {index > 0 && (
          <ConnectorRail
            hint={t('documents.builder.rootConnectorLabel')}
            label={connectorLabels[model.connector]}
            onToggle={() => onSetRootConnector(toggleConnector(model.connector))}
            variant="root"
          />
        )}
        <div className={styles.builderGroup}>
          <div className={styles.builderGroupHeader}>
            <span className={styles.builderGroupTitle}>
              {t('documents.builder.groupTitle', { index: index + 1 })}
            </span>
            <button
              aria-label={t('documents.builder.removeGroup')}
              className={styles.iconAction}
              disabled={model.groups.length <= 1}
              onClick={() => onRemoveGroup(group.id)}
              title={t('documents.builder.removeGroup')}
              type="button"
            >
              <Icon name="remove" />
            </button>
          </div>
          <div className={styles.builderConditions}>
            {group.conditions.map((condition, conditionIndex) => (
              <Fragment key={condition.id}>
                {conditionIndex > 0 && (
                  <ConnectorRail
                    hint={t('documents.builder.groupConnectorLabel')}
                    label={connectorLabels[group.connector]}
                    onToggle={() => onSetGroupConnector(group.id, toggleConnector(group.connector))}
                  />
                )}
                {renderCondition(group, condition)}
              </Fragment>
            ))}
          </div>
          <button
            className={styles.builderAddCondition}
            onClick={() => onAddCondition(group.id)}
            type="button"
          >
            <Icon name="add" />
            <span>{t('documents.builder.addCondition')}</span>
          </button>
        </div>
      </Fragment>
    )
  }

  return (
    <div className={styles.builder}>
      <p className={styles.builderHint}>{t('documents.builder.hint')}</p>
      {model.groups.map((group, index) => renderGroup(group, index))}
      <button className={styles.builderAddGroup} onClick={onAddGroup} type="button">
        <Icon name="add" />
        <span>{t('documents.builder.addGroup')}</span>
      </button>
    </div>
  )
}
