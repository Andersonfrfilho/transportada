/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { CteBatchTableController } from '../hooks/useCteBatchTable.hook'
import {
  CTE_BATCH_CONDITION_FIELDS,
  CTE_BATCH_CONDITION_FIELD_TYPE,
  CTE_BATCH_OPERATORS_BY_TYPE,
  type CteBatchCondition,
  type CteBatchConditionField,
  type CteBatchConditionOperator,
  type CteBatchConditionType,
} from '../shared/cteBatchAdvancedFilter.service'
import { CTE_BATCH_STATUSES } from '../shared/cteBatchTable.service'
import styles from '../styles/cteBatch.module.css'

const CONNECTOR_OPTIONS = ['and', 'or'] as const

const INPUT_TYPE_BY_CONDITION: Readonly<Record<CteBatchConditionType, string>> = {
  date: 'date',
  number: 'number',
  option: 'text',
  text: 'text',
}

type ConditionRowProps = Readonly<{
  condition: CteBatchCondition
  groupId: string
  isRemovable: boolean
  table: CteBatchTableController
}>

function ConditionRow({ condition, groupId, isRemovable, table }: ConditionRowProps) {
  const { t } = useTranslation('cteBatch')
  const conditionType = CTE_BATCH_CONDITION_FIELD_TYPE[condition.field]
  const operators: readonly CteBatchConditionOperator[] = CTE_BATCH_OPERATORS_BY_TYPE[conditionType]

  return (
    <div className={styles.conditionRow}>
      <label>
        {t('advanced.field')}
        <Select
          ariaLabel={t('advanced.field')}
          compact
          options={CTE_BATCH_CONDITION_FIELDS.map((field) => ({
            label: t(`columns.${field}`),
            value: field,
          }))}
          value={condition.field}
          onChange={(value) =>
            table.changeCondition(groupId, condition.id, {
              field: value as CteBatchConditionField,
            })
          }
        />
      </label>
      <label>
        {t('advanced.operator')}
        <Select
          ariaLabel={t('advanced.operator')}
          compact
          options={operators.map((operator) => ({
            label: t(`operator.${operator}`),
            value: operator,
          }))}
          value={condition.operator}
          onChange={(value) =>
            table.changeCondition(groupId, condition.id, {
              operator: value as CteBatchConditionOperator,
            })
          }
        />
      </label>
      <label>
        {t('advanced.value')}
        {conditionType === 'option' ? (
          <Select
            ariaLabel={t('advanced.value')}
            clearable
            compact
            options={CTE_BATCH_STATUSES.map((status) => ({
              label: t(`status.${status}`),
              value: status,
            }))}
            placeholder={t('filters.all')}
            value={condition.value}
            onChange={(value) => table.changeCondition(groupId, condition.id, { value })}
          />
        ) : (
          <input
            onChange={(event) =>
              table.changeCondition(groupId, condition.id, { value: event.target.value })
            }
            type={INPUT_TYPE_BY_CONDITION[conditionType]}
            value={condition.value}
          />
        )}
      </label>
      <label>
        {t('advanced.valueTo')}
        <input
          disabled={condition.operator !== 'between'}
          onChange={(event) =>
            table.changeCondition(groupId, condition.id, { valueTo: event.target.value })
          }
          type={INPUT_TYPE_BY_CONDITION[conditionType]}
          value={condition.valueTo}
        />
      </label>
      {isRemovable ? (
        <Button
          onClick={() => table.removeGroupCondition(groupId, condition.id)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="remove" />
          {t('advanced.removeCondition')}
        </Button>
      ) : null}
    </div>
  )
}

type CteBatchAdvancedFilterBuilderProps = Readonly<{ table: CteBatchTableController }>

export function CteBatchAdvancedFilterBuilder({ table }: CteBatchAdvancedFilterBuilderProps) {
  const { t } = useTranslation('cteBatch')

  return (
    <div className={styles.deck}>
      <label className={styles.counter}>
        {t('advanced.modelConnector')}
        <Select
          ariaLabel={t('advanced.modelConnector')}
          compact
          options={CONNECTOR_OPTIONS.map((connector) => ({
            label: t(`connector.${connector}`),
            value: connector,
          }))}
          value={table.advancedFilter.connector}
          onChange={(value) => table.setModelConnector(value === 'or' ? 'or' : 'and')}
        />
      </label>
      {table.advancedFilter.groups.map((group) => (
        <fieldset className={styles.conditionGroup} key={group.id}>
          <legend className={styles.hint}>{t('advanced.title')}</legend>
          <label className={styles.counter}>
            {t('advanced.groupConnector')}
            <Select
              ariaLabel={t('advanced.groupConnector')}
              compact
              options={CONNECTOR_OPTIONS.map((connector) => ({
                label: t(`connector.${connector}`),
                value: connector,
              }))}
              value={group.connector}
              onChange={(value) => table.setGroupConnector(group.id, value === 'or' ? 'or' : 'and')}
            />
          </label>
          {group.conditions.map((condition) => (
            <ConditionRow
              condition={condition}
              groupId={group.id}
              isRemovable={group.conditions.length > 1}
              key={condition.id}
              table={table}
            />
          ))}
          <div className={styles.bulkActions}>
            <Button
              onClick={() => table.addGroupCondition(group.id)}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Icon name="add" />
              {t('advanced.addCondition')}
            </Button>
            {table.advancedFilter.groups.length > 1 ? (
              <Button
                onClick={() => table.removeConditionGroup(group.id)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Icon name="trash" />
                {t('advanced.removeGroup')}
              </Button>
            ) : null}
          </div>
        </fieldset>
      ))}
      <div className={styles.bulkActions}>
        <Button onClick={table.addConditionGroup} size="sm" type="button" variant="secondary">
          <Icon name="add" />
          {t('advanced.addGroup')}
        </Button>
      </div>
    </div>
  )
}
