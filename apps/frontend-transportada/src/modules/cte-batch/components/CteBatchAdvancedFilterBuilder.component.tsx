/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

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
        <select
          onChange={(event) =>
            table.changeCondition(groupId, condition.id, {
              field: event.target.value as CteBatchConditionField,
            })
          }
          value={condition.field}
        >
          {CTE_BATCH_CONDITION_FIELDS.map((field) => (
            <option key={field} value={field}>
              {t(`columns.${field}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('advanced.operator')}
        <select
          onChange={(event) =>
            table.changeCondition(groupId, condition.id, {
              operator: event.target.value as CteBatchConditionOperator,
            })
          }
          value={condition.operator}
        >
          {operators.map((operator) => (
            <option key={operator} value={operator}>
              {t(`operator.${operator}`)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t('advanced.value')}
        {conditionType === 'option' ? (
          <select
            onChange={(event) =>
              table.changeCondition(groupId, condition.id, { value: event.target.value })
            }
            value={condition.value}
          >
            <option value="" />
            {CTE_BATCH_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`status.${status}`)}
              </option>
            ))}
          </select>
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
        <select
          onChange={(event) => table.setModelConnector(event.target.value === 'or' ? 'or' : 'and')}
          value={table.advancedFilter.connector}
        >
          <option value="and">{t('connector.and')}</option>
          <option value="or">{t('connector.or')}</option>
        </select>
      </label>
      {table.advancedFilter.groups.map((group) => (
        <fieldset className={styles.conditionGroup} key={group.id}>
          <legend className={styles.hint}>{t('advanced.title')}</legend>
          <label className={styles.counter}>
            {t('advanced.groupConnector')}
            <select
              onChange={(event) =>
                table.setGroupConnector(group.id, event.target.value === 'or' ? 'or' : 'and')
              }
              value={group.connector}
            >
              <option value="and">{t('connector.and')}</option>
              <option value="or">{t('connector.or')}</option>
            </select>
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
              {t('advanced.addCondition')}
            </Button>
            {table.advancedFilter.groups.length > 1 ? (
              <Button
                onClick={() => table.removeConditionGroup(group.id)}
                size="sm"
                type="button"
                variant="ghost"
              >
                {t('advanced.removeGroup')}
              </Button>
            ) : null}
          </div>
        </fieldset>
      ))}
      <div className={styles.bulkActions}>
        <Button onClick={table.addConditionGroup} size="sm" type="button" variant="secondary">
          {t('advanced.addGroup')}
        </Button>
      </div>
    </div>
  )
}
