/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { DateRangePicker } from '@/components/ui/date-range-picker'
import { Icon } from '@/components/ui/icon'
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select'
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select'
import { Select, type SelectOption } from '@/components/ui/select'
import { formatTaxId } from '@/modules/shared/taxId.service'

import { AdvancedFilterBuilder } from './AdvancedFilterBuilder.component'
import { AMOUNT_OPERATOR_SYMBOL, AMOUNT_OPERATORS, CTE_ISSUED_FILTER_VALUES } from './nfeFilter.constant'
import styles from './nfeFilterPanel.module.css'
import type { NfeFilterPanelController } from './NfeFilterPanelController.types'
import type { AmountOperator, FilterMode, NfeFilterStatus } from './nfeFilter.types'

const FILTER_MODES: readonly FilterMode[] = ['simple', 'advanced']
const STATUS_VALUES: readonly NfeFilterStatus[] = ['authorized', 'cancelled', 'denied']

function toOptions(values: readonly string[]): readonly SelectOption[] {
  return values.map((value) => ({ label: value, value }))
}

function toTaxIdOptions(values: readonly string[]): readonly MultiSelectOption[] {
  return values.map((value) => ({ label: formatTaxId(value), value }))
}

/** A lista só conhece as notas já carregadas; o que for digitado continua valendo como `contém`. */
function toTypedOption(query: string): SearchableSelectOption {
  return { label: query, value: query }
}

/** Cópia fiel da tabela: a extração tinha inventado outra chave, e o rótulo cru vazava para a tela. */
function cteIssuedLabelKey(value: string): string {
  return value === 'issued' ? 'filters.cteIssuedIssued' : 'filters.cteIssuedPending'
}

type NfeDocumentFilterPanelProps = Readonly<{ controller: NfeFilterPanelController }>

/**
 * O painel saiu de dentro da tabela porque passou a ter **dois** consumidores: a listagem de notas e
 * a criação de viagem, que monta o lote com os mesmos filtros que o operador acabou de usar. Copiar
 * o bloco daria duas telas concordando hoje e divergindo no primeiro filtro novo.
 *
 * Ele é autocontido de propósito: as listas de opção derivam do `controller` e da tradução, então quem o
 * renderiza só precisa ter um controlador — não precisa saber montar `selectFieldOptions`.
 */
export function NfeDocumentFilterPanel({ controller }: NfeDocumentFilterPanelProps) {
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
    emitterCity: toOptions(controller.cityOptions.emitterCity),
    emitterState: toOptions(controller.stateOptions.emitterState),
    recipientCity: toOptions(controller.cityOptions.recipientCity),
    recipientState: toOptions(controller.stateOptions.recipientState),
    status: statusOptions,
  } as const

  /** O primitivo de busca não tem botão de limpar: voltar a "todos" é escolher a primeira opção. */
  function toTextOptions(values: readonly string[]): readonly SearchableSelectOption[] {
    return [
      { label: t('filters.all'), value: '' },
      ...values.map((value) => ({ label: value, value })),
    ]
  }

  const isAdvancedMode = controller.capabilities.advanced && controller.mode === 'advanced'

  return (
    <div className={styles.filterPanel}>
      {controller.capabilities.advanced && (
        <div
          aria-label={t('documents.filterMode.label')}
          className={styles.filterModeBar}
          role="group"
        >
          {FILTER_MODES.map((filterMode) => (
            <button
              aria-pressed={controller.mode === filterMode}
              className={controller.mode === filterMode ? styles.tabActive : styles.tab}
              key={filterMode}
              onClick={() => controller.setMode(filterMode)}
              type="button"
            >
              {t(`documents.filterMode.${filterMode}`)}
            </button>
          ))}
        </div>
      )}
      {isAdvancedMode ? (
        <div className={styles.builderWrapper}>
          <AdvancedFilterBuilder
            model={controller.advancedFilter}
            onAddCondition={controller.addCondition}
            onAddGroup={controller.addGroup}
            onClearConditions={controller.clearConditions}
            onRemoveCondition={controller.removeCondition}
            onRemoveGroup={controller.removeGroup}
            onSetGroupConnector={controller.setGroupConnector}
            onSetRootConnector={controller.setRootConnector}
            onUpdateCondition={controller.updateCondition}
            selectFieldOptions={selectFieldOptions}
          />
          <button
            className={styles.builderSave}
            disabled={controller.activeConditionCount === 0}
            onClick={controller.saveAdvancedFilter}
            type="button"
          >
            <Icon name="save" />
            {t('documents.builder.save')}
          </button>
        </div>
      ) : (
        <div className={styles.filterGrid}>
          {controller.capabilities.unlinkedOnly && (
            <div className={styles.filterField}>
              <span className={styles.filterFieldLabel}>{t('filters.fiscalLink')}</span>
              <Checkbox
                checked={controller.filters.unlinkedOnly}
                label={t('filters.unlinkedOnly')}
                onChange={controller.setUnlinkedOnly}
              />
            </div>
          )}

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.cteIssued')}</span>
            <Select
              ariaLabel={t('documents.fields.cteIssued')}
              clearable
              compact
              onChange={(value) => controller.setSelectFilter('cteIssued', value)}
              options={cteIssuedOptions}
              placeholder={t('filters.all')}
              value={controller.filters.select.cteIssued}
            />
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.number')}</span>
            <div className={styles.rangeInputs}>
              <input
                aria-label={t('documents.numberFrom')}
                className={styles.filterInput}
                inputMode="numeric"
                onChange={(event) => controller.setNumberFrom(event.target.value)}
                placeholder={t('documents.numberFrom')}
                value={controller.filters.numberFrom}
              />
              <input
                aria-label={t('documents.numberTo')}
                className={styles.filterInput}
                inputMode="numeric"
                onChange={(event) => controller.setNumberTo(event.target.value)}
                placeholder={t('documents.numberTo')}
                value={controller.filters.numberTo}
              />
            </div>
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.issuedAt')}</span>
            <DateRangePicker
              ariaLabel={t('documents.fields.issuedAt')}
              clearLabel={t('documents.clearAll')}
              from={controller.filters.dateFrom}
              nextMonthLabel={t('documents.nextMonth')}
              onChange={controller.setDateRange}
              placeholder={t('documents.datePlaceholder')}
              previousMonthLabel={t('documents.previousMonth')}
              to={controller.filters.dateTo}
            />
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.totalAmount')}</span>
            <div className={styles.amountRow}>
              <Select
                ariaLabel={t('documents.operator')}
                clearable={false}
                compact
                onChange={(value) => controller.setAmountOperator(value as AmountOperator)}
                options={operatorOptions}
                placeholder={AMOUNT_OPERATOR_SYMBOL[controller.filters.amountOperator]}
                value={controller.filters.amountOperator}
              />
              <input
                aria-label={t('documents.fields.totalAmount')}
                className={styles.filterInput}
                inputMode="decimal"
                onChange={(event) => controller.setAmountValue(event.target.value)}
                placeholder={t('documents.fields.totalAmount')}
                value={controller.filters.amountValue}
              />
            </div>
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.emitterName')}</span>
            <MultiSelect
              ariaLabel={t('documents.fields.emitterName')}
              clearAllLabel={t('filters.clearSelection')}
              compact
              emptyLabel={t('filters.searchEmpty')}
              onChange={(values) => controller.setMultiFilter('emitterName', values)}
              options={toOptions(controller.emitterOptions.emitterName)}
              placeholder={t('filters.all')}
              removeLabel={t('filters.removeSelection')}
              searchPlaceholder={t('filters.search')}
              summaryLabel={(count) => t('filters.selectedSummary', { count })}
              values={controller.filters.multi.emitterName}
            />
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.emitterTaxId')}</span>
            <MultiSelect
              ariaLabel={t('documents.fields.emitterTaxId')}
              clearAllLabel={t('filters.clearSelection')}
              compact
              emptyLabel={t('filters.searchEmpty')}
              onChange={(values) => controller.setMultiFilter('emitterTaxId', values)}
              options={toTaxIdOptions(controller.emitterOptions.emitterTaxId)}
              placeholder={t('filters.all')}
              removeLabel={t('filters.removeSelection')}
              searchPlaceholder={t('filters.search')}
              summaryLabel={(count) => t('filters.selectedSummary', { count })}
              values={controller.filters.multi.emitterTaxId}
            />
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.emitterAddress')}</span>
            <SearchableSelect
              ariaLabel={t('documents.fields.emitterAddress')}
              emptyLabel={t('filters.searchEmpty')}
              onChange={(value) => controller.setTextFilter('emitterAddress', value)}
              options={toTextOptions(controller.textOptions.emitterAddress)}
              placeholder={t('filters.all')}
              resolveCustomOption={toTypedOption}
              searchPlaceholder={t('filters.search')}
              value={controller.filters.text.emitterAddress}
            />
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.emitterCity')}</span>
            <Select
              ariaLabel={t('documents.fields.emitterCity')}
              clearable
              compact
              emptyLabel={t('filters.searchEmpty')}
              onChange={(value) => controller.setSelectFilter('emitterCity', value)}
              options={toOptions(controller.cityOptions.emitterCity)}
              placeholder={t('filters.all')}
              searchPlaceholder={t('filters.search')}
              value={controller.filters.select.emitterCity}
            />
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.emitterState')}</span>
            <Select
              ariaLabel={t('documents.fields.emitterState')}
              clearable
              compact
              emptyLabel={t('filters.searchEmpty')}
              onChange={(value) => controller.setSelectFilter('emitterState', value)}
              options={toOptions(controller.stateOptions.emitterState)}
              placeholder={t('filters.all')}
              searchPlaceholder={t('filters.search')}
              value={controller.filters.select.emitterState}
            />
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.recipientName')}</span>
            <SearchableSelect
              ariaLabel={t('documents.fields.recipientName')}
              emptyLabel={t('filters.searchEmpty')}
              onChange={(value) => controller.setTextFilter('recipientName', value)}
              options={toTextOptions(controller.textOptions.recipientName)}
              placeholder={t('filters.all')}
              resolveCustomOption={toTypedOption}
              searchPlaceholder={t('filters.search')}
              value={controller.filters.text.recipientName}
            />
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>
              {t('documents.fields.recipientAddress')}
            </span>
            <SearchableSelect
              ariaLabel={t('documents.fields.recipientAddress')}
              emptyLabel={t('filters.searchEmpty')}
              onChange={(value) => controller.setTextFilter('recipientAddress', value)}
              options={toTextOptions(controller.textOptions.recipientAddress)}
              placeholder={t('filters.all')}
              resolveCustomOption={toTypedOption}
              searchPlaceholder={t('filters.search')}
              value={controller.filters.text.recipientAddress}
            />
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.recipientCity')}</span>
            <Select
              ariaLabel={t('documents.fields.recipientCity')}
              clearable
              compact
              emptyLabel={t('filters.searchEmpty')}
              onChange={(value) => controller.setSelectFilter('recipientCity', value)}
              options={toOptions(controller.cityOptions.recipientCity)}
              placeholder={t('filters.all')}
              searchPlaceholder={t('filters.search')}
              value={controller.filters.select.recipientCity}
            />
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.recipientState')}</span>
            <Select
              ariaLabel={t('documents.fields.recipientState')}
              clearable
              compact
              emptyLabel={t('filters.searchEmpty')}
              onChange={(value) => controller.setSelectFilter('recipientState', value)}
              options={toOptions(controller.stateOptions.recipientState)}
              placeholder={t('filters.all')}
              searchPlaceholder={t('filters.search')}
              value={controller.filters.select.recipientState}
            />
          </div>

          <div className={styles.filterField}>
            <span className={styles.filterFieldLabel}>{t('documents.fields.status')}</span>
            <Select
              ariaLabel={t('documents.fields.status')}
              clearable
              compact
              onChange={(value) => controller.setSelectFilter('status', value)}
              options={statusOptions}
              placeholder={t('filters.all')}
              value={controller.filters.select.status}
            />
          </div>
        </div>
      )}
    </div>
  )
}
