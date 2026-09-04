/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Icon } from '@/components/ui/icon'
import { Select, type SelectOption } from '@/components/ui/select'

import {
  AMOUNT_OPERATORS,
  AMOUNT_OPERATOR_SYMBOL,
  CTE_ISSUED_FILTER_VALUES,
  type AmountOperator,
  type DocumentStatus,
  type FilterMode,
  type UseNfeDocumentTableResult,
} from '../hooks/useNfeDocumentTable.hook'
import styles from '../styles/nfeWorkspace.module.css'
import { AdvancedFilterBuilder } from './AdvancedFilterBuilder.component'

const FILTER_MODES: readonly FilterMode[] = ['simple', 'advanced']
const STATUS_VALUES: readonly DocumentStatus[] = ['authorized', 'cancelled', 'denied']

function toOptions(values: readonly string[]): readonly SelectOption[] {
  return values.map((value) => ({ label: value, value }))
}

/** Cópia fiel da tabela: a extração tinha inventado outra chave, e o rótulo cru vazava para a tela. */
function cteIssuedLabelKey(value: string): string {
  return value === 'issued' ? 'filters.cteIssuedIssued' : 'filters.cteIssuedPending'
}

type NfeDocumentFilterPanelProps = Readonly<{ table: UseNfeDocumentTableResult }>

/**
 * O painel saiu de dentro da tabela porque passou a ter **dois** consumidores: a listagem de notas e
 * a criação de viagem, que monta o lote com os mesmos filtros que o operador acabou de usar. Copiar
 * o bloco daria duas telas concordando hoje e divergindo no primeiro filtro novo.
 *
 * Ele é autocontido de propósito: as listas de opção derivam do `table` e da tradução, então quem o
 * renderiza só precisa ter um controlador — não precisa saber montar `selectFieldOptions`.
 */
export function NfeDocumentFilterPanel({ table }: NfeDocumentFilterPanelProps) {
  const { t } = useTranslation('nfeWorkspace')

  const operatorOptions: readonly SelectOption[] = AMOUNT_OPERATORS.map((operator) => ({
    label: AMOUNT_OPERATOR_SYMBOL[operator],
    value: operator,
  }))
  const statusOptions: readonly SelectOption[] = STATUS_VALUES.map((status) => ({
    label: t(`documentStatus.${status}`),
    value: status,
  }))
  const cteIssuedOptions: readonly SelectOption[] = CTE_ISSUED_FILTER_VALUES.map((value) => ({
    label: t(cteIssuedLabelKey(value)),
    value,
  }))
  const selectFieldOptions = {
    cteIssued: cteIssuedOptions,
    emitterCity: toOptions(table.cityOptions.emitterCity),
    emitterState: toOptions(table.stateOptions.emitterState),
    recipientCity: toOptions(table.cityOptions.recipientCity),
    recipientState: toOptions(table.stateOptions.recipientState),
    status: statusOptions,
  } as const

  return (
    <div className={styles.filterPanel}>
      <div
        aria-label={t('documents.filterMode.label')}
        className={styles.filterModeBar}
        role="group"
      >
        {FILTER_MODES.map((filterMode) => (
          <button
            aria-pressed={table.mode === filterMode}
            className={table.mode === filterMode ? styles.tabActive : styles.tab}
            key={filterMode}
            onClick={() => table.setMode(filterMode)}
            type="button"
          >
            {t(`documents.filterMode.${filterMode}`)}
          </button>
        ))}
      </div>
      {table.mode === 'advanced' ? (
        <div className={styles.builderWrapper}>
          <AdvancedFilterBuilder
            model={table.advancedFilter}
            onAddCondition={table.addCondition}
            onAddGroup={table.addGroup}
            onRemoveCondition={table.removeCondition}
            onRemoveGroup={table.removeGroup}
            onSetGroupConnector={table.setGroupConnector}
            onSetRootConnector={table.setRootConnector}
            onUpdateCondition={table.updateCondition}
            selectFieldOptions={selectFieldOptions}
          />
          <button
            className={styles.builderSave}
            disabled={table.activeConditionCount === 0}
            onClick={table.saveAdvancedFilter}
            type="button"
          >
            <Icon name="save" />
            {t('documents.builder.save')}
          </button>
        </div>
      ) : (
        <div className={styles.filterGrid}>
          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.cteIssued')}</span>
            <Select
              ariaLabel={t('documents.fields.cteIssued')}
              clearable
              onChange={(value) => table.setSelectFilter('cteIssued', value)}
              options={cteIssuedOptions}
              placeholder={t('filters.all')}
              value={table.filters.select.cteIssued}
            />
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.number')}</span>
            <div className={styles.rangeInputs}>
              <input
                aria-label={t('documents.numberFrom')}
                className={styles.filterInput}
                inputMode="numeric"
                onChange={(event) => table.setNumberFrom(event.target.value)}
                placeholder={t('documents.numberFrom')}
                value={table.filters.numberFrom}
              />
              <input
                aria-label={t('documents.numberTo')}
                className={styles.filterInput}
                inputMode="numeric"
                onChange={(event) => table.setNumberTo(event.target.value)}
                placeholder={t('documents.numberTo')}
                value={table.filters.numberTo}
              />
            </div>
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.issuedAt')}</span>
            <DateRangePicker
              ariaLabel={t('documents.fields.issuedAt')}
              clearLabel={t('documents.clearAll')}
              from={table.filters.dateFrom}
              nextMonthLabel={t('documents.nextMonth')}
              onChange={table.setDateRange}
              placeholder={t('documents.datePlaceholder')}
              previousMonthLabel={t('documents.previousMonth')}
              to={table.filters.dateTo}
            />
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.totalAmount')}</span>
            <div className={styles.amountRow}>
              <Select
                ariaLabel={t('documents.operator')}
                clearable={false}
                compact
                onChange={(value) => table.setAmountOperator(value as AmountOperator)}
                options={operatorOptions}
                placeholder={AMOUNT_OPERATOR_SYMBOL[table.filters.amountOperator]}
                value={table.filters.amountOperator}
              />
              <input
                aria-label={t('documents.fields.totalAmount')}
                className={styles.filterInput}
                inputMode="decimal"
                onChange={(event) => table.setAmountValue(event.target.value)}
                placeholder={t('documents.fields.totalAmount')}
                value={table.filters.amountValue}
              />
            </div>
          </div>

          <label className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.emitterName')}</span>
            <input
              className={styles.filterInput}
              onChange={(event) => table.setTextFilter('emitterName', event.target.value)}
              placeholder={t('documents.fields.emitterName')}
              type="text"
              value={table.filters.text.emitterName}
            />
          </label>

          <label className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.emitterAddress')}</span>
            <input
              className={styles.filterInput}
              onChange={(event) => table.setTextFilter('emitterAddress', event.target.value)}
              placeholder={t('documents.fields.emitterAddress')}
              type="text"
              value={table.filters.text.emitterAddress}
            />
          </label>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.emitterCity')}</span>
            <Select
              ariaLabel={t('documents.fields.emitterCity')}
              clearable
              emptyLabel={t('filters.searchEmpty')}
              onChange={(value) => table.setSelectFilter('emitterCity', value)}
              options={toOptions(table.cityOptions.emitterCity)}
              placeholder={t('filters.all')}
              searchPlaceholder={t('filters.search')}
              value={table.filters.select.emitterCity}
            />
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.emitterState')}</span>
            <Select
              ariaLabel={t('documents.fields.emitterState')}
              clearable
              emptyLabel={t('filters.searchEmpty')}
              onChange={(value) => table.setSelectFilter('emitterState', value)}
              options={toOptions(table.stateOptions.emitterState)}
              placeholder={t('filters.all')}
              searchPlaceholder={t('filters.search')}
              value={table.filters.select.emitterState}
            />
          </div>

          <label className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.recipientName')}</span>
            <input
              className={styles.filterInput}
              onChange={(event) => table.setTextFilter('recipientName', event.target.value)}
              placeholder={t('documents.fields.recipientName')}
              type="text"
              value={table.filters.text.recipientName}
            />
          </label>

          <label className={styles.filterField}>
            <span className={styles.filterFieldLabel}>
              {t('documents.fields.recipientAddress')}
            </span>
            <input
              className={styles.filterInput}
              onChange={(event) => table.setTextFilter('recipientAddress', event.target.value)}
              placeholder={t('documents.fields.recipientAddress')}
              type="text"
              value={table.filters.text.recipientAddress}
            />
          </label>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.recipientCity')}</span>
            <Select
              ariaLabel={t('documents.fields.recipientCity')}
              clearable
              emptyLabel={t('filters.searchEmpty')}
              onChange={(value) => table.setSelectFilter('recipientCity', value)}
              options={toOptions(table.cityOptions.recipientCity)}
              placeholder={t('filters.all')}
              searchPlaceholder={t('filters.search')}
              value={table.filters.select.recipientCity}
            />
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.recipientState')}</span>
            <Select
              ariaLabel={t('documents.fields.recipientState')}
              clearable
              emptyLabel={t('filters.searchEmpty')}
              onChange={(value) => table.setSelectFilter('recipientState', value)}
              options={toOptions(table.stateOptions.recipientState)}
              placeholder={t('filters.all')}
              searchPlaceholder={t('filters.search')}
              value={table.filters.select.recipientState}
            />
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.status')}</span>
            <Select
              ariaLabel={t('documents.fields.status')}
              clearable
              onChange={(value) => table.setSelectFilter('status', value)}
              options={statusOptions}
              placeholder={t('filters.all')}
              value={table.filters.select.status}
            />
          </div>
        </div>
      )}
    </div>
  )
}
