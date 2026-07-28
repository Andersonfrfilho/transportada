/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { MdfeManifestTableController } from '../hooks/useMdfeManifestTable.hook'
import {
  MDFE_MANIFEST_CONDITION_FIELDS,
  MDFE_MANIFEST_CONDITION_FIELD_TYPE,
  MDFE_MANIFEST_OPERATORS_BY_TYPE,
  type MdfeManifestCondition,
  type MdfeManifestConditionField,
  type MdfeManifestConditionOperator,
  type MdfeManifestConditionType,
} from '../shared/mdfeManifestAdvancedFilter.service'
import { MDFE_MANIFEST_STATUSES } from '../shared/mdfeManifestTable.service'
import styles from '../styles/mdfeManifest.module.css'

const INPUT_TYPE_BY_CONDITION: Readonly<Record<MdfeManifestConditionType, string>> = {
  date: 'date',
  number: 'number',
  option: 'text',
  text: 'text',
}

type ConditionRowProps = Readonly<{
  condition: MdfeManifestCondition
  groupId: string
  isRemovable: boolean
  table: MdfeManifestTableController
}>

function ConditionRow({ condition, groupId, isRemovable, table }: ConditionRowProps) {
  const { t } = useTranslation('mdfeManifest')
  const conditionType = MDFE_MANIFEST_CONDITION_FIELD_TYPE[condition.field]
  const operators: readonly MdfeManifestConditionOperator[] =
    MDFE_MANIFEST_OPERATORS_BY_TYPE[conditionType]

  return (
    <div className={styles.conditionRow}>
      <label>
        {t('advanced.field')}
        <select
          onChange={(event) =>
            table.changeCondition(groupId, condition.id, {
              field: event.target.value as MdfeManifestConditionField,
            })
          }
          value={condition.field}
        >
          {MDFE_MANIFEST_CONDITION_FIELDS.map((field) => (
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
              operator: event.target.value as MdfeManifestConditionOperator,
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
            {MDFE_MANIFEST_STATUSES.map((status) => (
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

type MdfeManifestAdvancedFilterBuilderProps = Readonly<{ table: MdfeManifestTableController }>

export function MdfeManifestAdvancedFilterBuilder({
  table,
}: MdfeManifestAdvancedFilterBuilderProps) {
  const { t } = useTranslation('mdfeManifest')

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
