/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import type { NfeDocumentListItem } from '../shared/nfeWorkspaceClient.service'
import {
  AMOUNT_OPERATORS,
  AMOUNT_OPERATOR_SYMBOL,
  PAGE_SIZE_OPTIONS,
  useNfeDocumentTable,
  type AmountOperator,
  type ColumnKey,
  type DocumentStatus,
  type FilterKey,
  type FilterMode,
  type SortColumn,
  type SortDirection,
} from '../hooks/useNfeDocumentTable.hook'
import { useCteEmissionDialog } from '../hooks/useCteEmissionDialog.hook'
import { useTableViewPreferences } from '../hooks/useTableViewPreferences.hook'
import {
  createViewPreferencesClient,
  type ViewPreferencesClient,
} from '../shared/viewPreferencesClient.service'
import styles from '../styles/nfeWorkspace.module.css'
import { AdvancedFilterBuilder } from './AdvancedFilterBuilder.component'
import { CopyButton } from './CopyButton.component'
import { CteEmissionDialog } from './CteEmissionDialog.component'
import { DateRangePicker } from './DateRangePicker.component'
import { SelectMenu, type SelectMenuOption } from './SelectMenu.component'

type NfeDocumentTableProps = Readonly<{
  readonly documents: readonly NfeDocumentListItem[]
  readonly downloadErrorId: string | null
  readonly downloadingDocumentId: string | null
  readonly loading: boolean
  readonly onDownloadXml: (document: NfeDocumentListItem) => void
  readonly permissions: readonly string[]
  readonly companyId?: string
}>

type ColumnMeta = Readonly<{ align?: 'end'; sortColumn?: SortColumn }>

const COLUMN_META: Readonly<Record<ColumnKey, ColumnMeta>> = {
  amount: { align: 'end', sortColumn: 'amount' },
  emitter: { sortColumn: 'emitter' },
  emitterLocation: {},
  issuedAt: { sortColumn: 'issuedAt' },
  number: { sortColumn: 'number' },
  recipient: { sortColumn: 'recipient' },
  recipientLocation: {},
  series: { sortColumn: 'series' },
  status: { sortColumn: 'status' },
}

const FILTER_MODES: readonly FilterMode[] = ['simple', 'advanced']

const STATUS_VALUES: readonly DocumentStatus[] = ['authorized', 'cancelled', 'denied']

const DOCUMENT_STATUS_TONE: Readonly<Record<DocumentStatus, string | undefined>> = {
  authorized: styles.badgeReady,
  cancelled: styles.badgeMuted,
  denied: styles.badgeDanger,
}

const SKELETON_ROWS: readonly string[] = ['sk1', 'sk2', 'sk3', 'sk4', 'sk5', 'sk6', 'sk7', 'sk8']
const SKELETON_CELLS: readonly string[] = [
  'c1',
  'c2',
  'c3',
  'c4',
  'c5',
  'c6',
  'c7',
  'c8',
  'c9',
  'c10',
]

const VIEW_PREFERENCES_KEY = 'nfe-workspace.documents'

function getViewPreferencesClient(): ViewPreferencesClient {
  return createViewPreferencesClient({
    apiUrl: getIdentityEnvironment().apiBaseUrl,
    fetch: (request) => fetch(request),
    getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
  })
}

const currencyFormatter = new Intl.NumberFormat('pt-BR', { currency: 'BRL', style: 'currency' })
const dayFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

function formatAmount(value: string): string {
  const numeric = Number(value)
  return Number.isNaN(numeric) ? value : currencyFormatter.format(numeric)
}

function formatIssuedAt(value: string): string {
  return dayFormatter.format(new Date(value))
}

function formatDay(value: string): string {
  return value.length === 0 ? '…' : dayFormatter.format(new Date(`${value}T00:00:00`))
}

function formatLocation(city: string | null, state: string | null): string {
  return [city, state].filter((part) => part !== null && part.length > 0).join(' / ')
}

function toOptions(values: readonly string[]): readonly SelectMenuOption[] {
  return values.map((value) => ({ label: value, value }))
}

export function NfeDocumentTable({
  companyId,
  documents,
  downloadErrorId,
  downloadingDocumentId,
  loading,
  onDownloadXml,
  permissions,
}: NfeDocumentTableProps) {
  const { t } = useTranslation('nfeWorkspace')
  const [isFilterOpen, setIsFilterOpen] = useState(false)
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = useState(false)

  const statusLabels: Record<DocumentStatus, string> = {
    authorized: t('documentStatus.authorized'),
    cancelled: t('documentStatus.cancelled'),
    denied: t('documentStatus.denied'),
  }

  const viewPreferences = useTableViewPreferences({
    client: getViewPreferencesClient(),
    viewKey: VIEW_PREFERENCES_KEY,
  })
  const table = useNfeDocumentTable({ documents, preferences: viewPreferences, statusLabels })
  const cteEmission = useCteEmissionDialog({
    ...(companyId === undefined ? {} : { companyId }),
    documentIds: [...table.selectedIds],
    onEmitted: table.clearSelection,
    permissions,
  })

  const visibleColumns = table.columnOrder.filter((column) => table.isColumnVisible(column))
  const columnSpan = visibleColumns.length + 2

  const operatorOptions: readonly SelectMenuOption[] = AMOUNT_OPERATORS.map((operator) => ({
    label: AMOUNT_OPERATOR_SYMBOL[operator],
    value: operator,
  }))
  const statusOptions: readonly SelectMenuOption[] = STATUS_VALUES.map((status) => ({
    label: statusLabels[status],
    value: status,
  }))
  const selectFieldOptions = {
    emitterCity: toOptions(table.cityOptions.emitterCity),
    emitterState: toOptions(table.stateOptions.emitterState),
    recipientCity: toOptions(table.cityOptions.recipientCity),
    recipientState: toOptions(table.stateOptions.recipientState),
    status: statusOptions,
  } as const
  const pageSizeOptions: readonly SelectMenuOption[] = PAGE_SIZE_OPTIONS.map((size) => ({
    label: t('documents.perPage', { count: size }),
    value: String(size),
  }))

  const pills = table.mode === 'advanced' ? [] : buildPills()
  const showAdvancedPill = table.mode === 'simple' && table.savedConditionCount > 0
  const filterCount =
    table.mode === 'advanced'
      ? table.activeConditionCount
      : pills.length + (showAdvancedPill ? 1 : 0)

  function buildPills(): readonly { key: FilterKey; label: string }[] {
    const entries: { key: FilterKey; label: string }[] = []
    const { amountOperator, amountValue, dateFrom, dateTo, numberFrom, numberTo, select, text } =
      table.filters

    if (text.emitterName.trim().length > 0) {
      entries.push({
        key: 'emitterName',
        label: `${t('documents.fields.emitterName')}: ${text.emitterName}`,
      })
    }
    if (text.emitterAddress.trim().length > 0) {
      entries.push({
        key: 'emitterAddress',
        label: `${t('documents.fields.emitterAddress')}: ${text.emitterAddress}`,
      })
    }
    if (text.recipientName.trim().length > 0) {
      entries.push({
        key: 'recipientName',
        label: `${t('documents.fields.recipientName')}: ${text.recipientName}`,
      })
    }
    if (text.recipientAddress.trim().length > 0) {
      entries.push({
        key: 'recipientAddress',
        label: `${t('documents.fields.recipientAddress')}: ${text.recipientAddress}`,
      })
    }
    if (select.emitterCity.length > 0) {
      entries.push({
        key: 'emitterCity',
        label: `${t('documents.fields.emitterCity')}: ${select.emitterCity}`,
      })
    }
    if (select.emitterState.length > 0) {
      entries.push({
        key: 'emitterState',
        label: `${t('documents.fields.emitterState')}: ${select.emitterState}`,
      })
    }
    if (select.recipientCity.length > 0) {
      entries.push({
        key: 'recipientCity',
        label: `${t('documents.fields.recipientCity')}: ${select.recipientCity}`,
      })
    }
    if (select.recipientState.length > 0) {
      entries.push({
        key: 'recipientState',
        label: `${t('documents.fields.recipientState')}: ${select.recipientState}`,
      })
    }
    if (select.status.length > 0) {
      entries.push({
        key: 'status',
        label: `${t('documents.fields.status')}: ${statusLabels[select.status as DocumentStatus]}`,
      })
    }
    if (numberFrom.trim().length > 0 || numberTo.trim().length > 0) {
      entries.push({
        key: 'numberRange',
        label: `${t('documents.fields.number')}: ${numberFrom.length > 0 ? numberFrom : '…'}–${numberTo.length > 0 ? numberTo : '…'}`,
      })
    }
    if (amountValue.trim().length > 0) {
      entries.push({
        key: 'amount',
        label: `${t('documents.fields.totalAmount')} ${AMOUNT_OPERATOR_SYMBOL[amountOperator]} ${amountValue}`,
      })
    }
    if (dateFrom.length > 0 || dateTo.length > 0) {
      entries.push({
        key: 'dateRange',
        label: `${t('documents.fields.issuedAt')}: ${formatDay(dateFrom)} – ${formatDay(dateTo)}`,
      })
    }
    return entries
  }

  function handleBulkDownload(): void {
    for (const item of table.visibleSelected()) onDownloadXml(item)
  }

  function copyableCell(column: ColumnKey, display: string, className?: string) {
    const value = display.trim()
    return (
      <td className={className}>
        <div className={styles.copyCell}>
          <span className={styles.copyCellValue}>{display}</span>
          {value.length > 0 && (
            <CopyButton
              label={t('documents.copyValue', { field: t(`documents.columns.${column}`) })}
              value={value}
              variant="inline"
            />
          )}
        </div>
      </td>
    )
  }

  function renderCell(column: ColumnKey, document: NfeDocumentListItem) {
    if (column === 'number') return copyableCell('number', document.number, styles.numberCell)
    if (column === 'series') return copyableCell('series', document.series, styles.numberCell)
    if (column === 'issuedAt') {
      return copyableCell('issuedAt', formatIssuedAt(document.issuedAt), styles.numberCell)
    }
    if (column === 'emitter') {
      return copyableCell('emitter', document.emitterName, styles.emitterCell)
    }
    if (column === 'emitterLocation') {
      return renderLocationCell(
        document.emitterAddress,
        document.emitterCity,
        document.emitterState,
      )
    }
    if (column === 'recipient') return copyableCell('recipient', document.recipientName)
    if (column === 'recipientLocation') {
      return renderLocationCell(
        document.recipientAddress,
        document.recipientCity,
        document.recipientState,
      )
    }
    if (column === 'amount') {
      return copyableCell('amount', formatAmount(document.totalAmount), styles.amountCell)
    }
    return (
      <td>
        <span className={`${styles.badge} ${DOCUMENT_STATUS_TONE[document.status] ?? ''}`}>
          {statusLabels[document.status]}
        </span>
      </td>
    )
  }

  function renderLocationCell(address: string | null, city: string | null, state: string | null) {
    const location = formatLocation(city, state)
    return (
      <td className={styles.locationCell}>
        <span>{address ?? '—'}</span>
        {location.length > 0 && <span className={styles.locationMeta}>{location}</span>}
      </td>
    )
  }

  return (
    <section className={styles.dataPanel} aria-labelledby="nfe-documents-title">
      <div className={styles.panelHeading}>
        <div className={styles.panelHeadingRow}>
          <h2 id="nfe-documents-title">{t('documents.title')}</h2>
          <span className={styles.countBadge}>
            {t('documents.countFiltered', { shown: table.totalFiltered, total: documents.length })}
          </span>
        </div>
        <p>{t('documents.subtitle')}</p>
      </div>

      <div className={styles.tableToolbar}>
        <div className={styles.tableSearch}>
          <SearchIcon />
          <input
            aria-label={t('documents.search')}
            className={styles.tableSearchInput}
            onChange={(event) => table.setSearchTerm(event.target.value)}
            placeholder={t('documents.searchPlaceholder')}
            type="search"
            value={table.searchTerm}
          />
        </div>
        <button
          aria-expanded={isFilterOpen}
          aria-label={isFilterOpen ? t('filters.toggleClose') : t('filters.toggle')}
          className={isFilterOpen ? styles.iconActionActive : styles.iconAction}
          onClick={() => setIsFilterOpen((open) => !open)}
          title={isFilterOpen ? t('filters.toggleClose') : t('filters.toggle')}
          type="button"
        >
          <FilterIcon />
          {filterCount > 0 && <span className={styles.filterCountPill}>{filterCount}</span>}
        </button>
        <div className={styles.columnsMenuWrap}>
          <button
            aria-expanded={isColumnsMenuOpen}
            aria-label={t('documents.columnsMenu')}
            className={isColumnsMenuOpen ? styles.iconActionActive : styles.iconAction}
            onClick={() => setIsColumnsMenuOpen((open) => !open)}
            title={t('documents.columnsMenu')}
            type="button"
          >
            <ColumnsIcon />
          </button>
          {isColumnsMenuOpen && (
            <div className={styles.columnsMenu} role="menu">
              {table.columnOrder.map((column, index) => (
                <div className={styles.columnRow} key={column}>
                  <label className={styles.checkOption}>
                    <input
                      checked={table.isColumnVisible(column)}
                      onChange={() => table.toggleColumn(column)}
                      type="checkbox"
                    />
                    <span>{t(`documents.columns.${column}`)}</span>
                  </label>
                  <div className={styles.columnReorder}>
                    <button
                      aria-label={t('documents.columnsReorder.moveUp')}
                      className={styles.iconAction}
                      disabled={index === 0}
                      onClick={() => table.moveColumn(column, 'up')}
                      title={t('documents.columnsReorder.moveUp')}
                      type="button"
                    >
                      <MoveUpIcon />
                    </button>
                    <button
                      aria-label={t('documents.columnsReorder.moveDown')}
                      className={styles.iconAction}
                      disabled={index === table.columnOrder.length - 1}
                      onClick={() => table.moveColumn(column, 'down')}
                      title={t('documents.columnsReorder.moveDown')}
                      type="button"
                    >
                      <MoveDownIcon />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {table.hasActiveFilters && (
          <button
            aria-label={t('documents.clearAll')}
            className={styles.iconAction}
            onClick={table.clearAllFilters}
            title={t('documents.clearAll')}
            type="button"
          >
            <ClearFiltersIcon />
          </button>
        )}
      </div>

      {isFilterOpen && (
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
                {t('documents.builder.save')}
              </button>
            </div>
          ) : (
            <div className={styles.filterGrid}>
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
                  <SelectMenu
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
                <span className={styles.filterFieldLabel}>
                  {t('documents.fields.emitterAddress')}
                </span>
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
                <SelectMenu
                  ariaLabel={t('documents.fields.emitterCity')}
                  onChange={(value) => table.setSelectFilter('emitterCity', value)}
                  options={toOptions(table.cityOptions.emitterCity)}
                  placeholder={t('filters.all')}
                  value={table.filters.select.emitterCity}
                />
              </div>

              <div className={styles.filterField}>
                <span className={styles.filterFieldLabel}>
                  {t('documents.fields.emitterState')}
                </span>
                <SelectMenu
                  ariaLabel={t('documents.fields.emitterState')}
                  onChange={(value) => table.setSelectFilter('emitterState', value)}
                  options={toOptions(table.stateOptions.emitterState)}
                  placeholder={t('filters.all')}
                  value={table.filters.select.emitterState}
                />
              </div>

              <label className={styles.filterField}>
                <span className={styles.filterFieldLabel}>
                  {t('documents.fields.recipientName')}
                </span>
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
                <span className={styles.filterFieldLabel}>
                  {t('documents.fields.recipientCity')}
                </span>
                <SelectMenu
                  ariaLabel={t('documents.fields.recipientCity')}
                  onChange={(value) => table.setSelectFilter('recipientCity', value)}
                  options={toOptions(table.cityOptions.recipientCity)}
                  placeholder={t('filters.all')}
                  value={table.filters.select.recipientCity}
                />
              </div>

              <div className={styles.filterField}>
                <span className={styles.filterFieldLabel}>
                  {t('documents.fields.recipientState')}
                </span>
                <SelectMenu
                  ariaLabel={t('documents.fields.recipientState')}
                  onChange={(value) => table.setSelectFilter('recipientState', value)}
                  options={toOptions(table.stateOptions.recipientState)}
                  placeholder={t('filters.all')}
                  value={table.filters.select.recipientState}
                />
              </div>

              <div className={styles.filterField}>
                <span className={styles.filterFieldLabel}>{t('documents.fields.status')}</span>
                <SelectMenu
                  ariaLabel={t('documents.fields.status')}
                  onChange={(value) => table.setSelectFilter('status', value)}
                  options={statusOptions}
                  placeholder={t('filters.all')}
                  value={table.filters.select.status}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {(pills.length > 0 || showAdvancedPill) && (
        <div className={styles.filterPills}>
          {showAdvancedPill && (
            <span className={styles.filterPillAdvanced} key="advanced-filter">
              <button
                className={styles.filterPillEdit}
                onClick={table.editSavedAdvancedFilter}
                title={t('documents.builder.editSaved')}
                type="button"
              >
                {t('documents.builder.savedPill', { count: table.savedConditionCount })}
              </button>
              <button
                aria-label={t('documents.builder.removeSaved')}
                className={styles.filterPillRemove}
                onClick={table.clearSavedAdvancedFilter}
                title={t('documents.builder.removeSaved')}
                type="button"
              >
                <CloseIcon />
              </button>
            </span>
          )}
          {pills.map((pill) => (
            <span className={styles.filterPill} key={pill.key}>
              <span className={styles.filterPillLabel}>{pill.label}</span>
              <button
                aria-label={t('documents.removeFilter', { field: pill.label })}
                className={styles.filterPillRemove}
                onClick={() => table.clearFilter(pill.key)}
                type="button"
              >
                <CloseIcon />
              </button>
            </span>
          ))}
        </div>
      )}

      {table.selectedCount > 0 && (
        <div className={styles.selectionBar} role="status">
          <span>{t('documents.selectedCount', { count: table.selectedCount })}</span>
          <div className={styles.selectionActions}>
            {cteEmission.canEmit && (
              <button
                className={styles.iconActionActive}
                onClick={cteEmission.open}
                title={t('documents.emitCte', { count: table.selectedCount })}
                type="button"
              >
                {t('documents.emitCte', { count: table.selectedCount })}
              </button>
            )}
            <button
              aria-label={t('documents.downloadSelected')}
              className={styles.iconAction}
              onClick={handleBulkDownload}
              title={t('documents.downloadSelected')}
              type="button"
            >
              <DownloadIcon />
            </button>
            <button
              aria-label={t('documents.clearSelection')}
              className={styles.iconAction}
              onClick={table.clearSelection}
              title={t('documents.clearSelection')}
              type="button"
            >
              <CloseIcon />
            </button>
          </div>
        </div>
      )}

      <CteEmissionDialog dialog={cteEmission} />

      {documents.length === 0 ? (
        loading ? (
          <TableSkeleton />
        ) : (
          <p className={styles.emptyState}>{t('documents.empty')}</p>
        )
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.selectCell} scope="col">
                    <input
                      aria-label={t('documents.selectAll')}
                      checked={table.allSelected}
                      onChange={table.toggleSelectAll}
                      ref={(element) => {
                        if (element) element.indeterminate = table.someSelected
                      }}
                      type="checkbox"
                    />
                  </th>
                  {visibleColumns.map((column) =>
                    COLUMN_META[column].sortColumn === undefined ? (
                      <th
                        className={
                          COLUMN_META[column].align === 'end' ? styles.headerEnd : undefined
                        }
                        key={column}
                        scope="col"
                      >
                        {t(`documents.columns.${column}`)}
                      </th>
                    ) : (
                      <SortableHeader
                        active={table.sort?.column === COLUMN_META[column].sortColumn}
                        align={COLUMN_META[column].align}
                        direction={
                          table.sort?.column === COLUMN_META[column].sortColumn
                            ? table.sort.direction
                            : null
                        }
                        key={column}
                        label={t(`documents.columns.${column}`)}
                        onSort={() =>
                          table.toggleSort(COLUMN_META[column].sortColumn as SortColumn)
                        }
                      />
                    ),
                  )}
                  <th scope="col">{t('documents.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {table.pageItems.length === 0 && (
                  <tr>
                    <td className={styles.tableEmpty} colSpan={columnSpan}>
                      {t('documents.emptyFiltered')}
                    </td>
                  </tr>
                )}
                {table.pageItems.map((document) => {
                  const downloading = downloadingDocumentId === document.id
                  const selected = table.selectedIds.has(document.id)
                  return (
                    <tr className={selected ? styles.rowSelected : undefined} key={document.id}>
                      <td className={styles.selectCell}>
                        <input
                          aria-label={t('documents.selectRow')}
                          checked={selected}
                          onChange={() => table.toggleRow(document.id)}
                          type="checkbox"
                        />
                      </td>
                      {visibleColumns.map((column) => (
                        <RenderCellSlot key={column}>{renderCell(column, document)}</RenderCellSlot>
                      ))}
                      <td>
                        <button
                          aria-label={t('documents.downloadXml')}
                          className={styles.iconAction}
                          disabled={downloading}
                          onClick={() => onDownloadXml(document)}
                          title={
                            downloading
                              ? t('documents.downloadPending')
                              : t('documents.downloadXml')
                          }
                          type="button"
                        >
                          <DownloadIcon />
                        </button>
                        {downloading === false && downloadErrorId === document.id && (
                          <span className={styles.cardError} role="alert">
                            {t('documents.downloadError')}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className={styles.pagination}>
            <span className={styles.rangeLabel}>
              {t('documents.range', {
                end: table.rangeEnd,
                start: table.rangeStart,
                total: table.totalFiltered,
              })}
              {loading && ` · ${t('documents.loadingAll')}`}
            </span>
            <div className={styles.pager}>
              <SelectMenu
                align="end"
                ariaLabel={t('documents.pageSize')}
                clearable={false}
                compact
                onChange={(value) => table.setPageSize(Number(value))}
                options={pageSizeOptions}
                placeholder={t('documents.pageSize')}
                value={String(table.pageSize)}
              />
              <button
                aria-label={t('documents.firstPage')}
                className={styles.iconAction}
                disabled={table.safePage === 0}
                onClick={() => table.setPage(0)}
                title={t('documents.firstPage')}
                type="button"
              >
                <FirstPageIcon />
              </button>
              <button
                aria-label={t('documents.previousPage')}
                className={styles.iconAction}
                disabled={table.safePage === 0}
                onClick={() => table.setPage(table.safePage - 1)}
                title={t('documents.previousPage')}
                type="button"
              >
                <PreviousPageIcon />
              </button>
              <span className={styles.pageIndicator}>
                {t('documents.pageIndicator', {
                  current: table.safePage + 1,
                  total: table.pageCount,
                })}
              </span>
              <button
                aria-label={t('documents.nextPage')}
                className={styles.iconAction}
                disabled={table.safePage >= table.pageCount - 1}
                onClick={() => table.setPage(table.safePage + 1)}
                title={t('documents.nextPage')}
                type="button"
              >
                <NextPageIcon />
              </button>
              <button
                aria-label={t('documents.lastPage')}
                className={styles.iconAction}
                disabled={table.safePage >= table.pageCount - 1}
                onClick={() => table.setPage(table.pageCount - 1)}
                title={t('documents.lastPage')}
                type="button"
              >
                <LastPageIcon />
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function RenderCellSlot({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>
}

function TableSkeleton() {
  const { t } = useTranslation('nfeWorkspace')
  return (
    <>
      <p className={styles.srOnly} role="status">
        {t('documents.loadingAll')}
      </p>
      <div className={styles.tableWrap} aria-hidden="true">
        <table className={styles.table}>
          <tbody>
            {SKELETON_ROWS.map((rowKey) => (
              <tr key={rowKey}>
                {SKELETON_CELLS.map((cellKey) => (
                  <td key={cellKey}>
                    <span className={styles.skeletonBar} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

type SortableHeaderProps = Readonly<{
  readonly active: boolean
  readonly align: 'end' | undefined
  readonly direction: SortDirection | null
  readonly label: string
  readonly onSort: () => void
}>

function SortableHeader({ active, align, direction, label, onSort }: SortableHeaderProps) {
  const ariaSort = active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'
  return (
    <th aria-sort={ariaSort} className={align === 'end' ? styles.headerEnd : undefined} scope="col">
      <button
        className={active ? styles.columnSortActive : styles.columnSort}
        onClick={onSort}
        type="button"
      >
        <span>{label}</span>
        <SortIcon direction={active ? direction : null} />
      </button>
    </th>
  )
}

function SortIcon({ direction }: Readonly<{ direction: SortDirection | null }>) {
  return (
    <svg aria-hidden="true" className={styles.sortIcon} viewBox="0 0 24 24">
      <path className={sortArrowClass(direction === 'asc')} d="m8 10 4-4 4 4" />
      <path className={sortArrowClass(direction === 'desc')} d="m8 14 4 4 4-4" />
    </svg>
  )
}

function sortArrowClass(isActive: boolean): string {
  const base = styles.sortArrow ?? ''
  return isActive ? `${base} ${styles.sortActiveArrow ?? ''}` : base
}

function DownloadIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 19h14" />
    </svg>
  )
}

function FilterIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <path d="M4 5h16" />
      <path d="M7 10h10" />
      <path d="M10 15h4" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  )
}

function ColumnsIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <rect height="16" rx="1" width="5" x="4" y="4" />
      <rect height="16" rx="1" width="5" x="15" y="4" />
    </svg>
  )
}

function MoveUpIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <path d="M12 19V6" />
      <path d="m6 11 6-6 6 6" />
    </svg>
  )
}

function MoveDownIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <path d="M12 5v13" />
      <path d="m6 13 6 6 6-6" />
    </svg>
  )
}

function ClearFiltersIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <path d="M4 5h16" />
      <path d="M7 5v4l3 3v7l4 2v-9l3-3V5" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
  )
}

function FirstPageIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <path d="M18 6l-6 6 6 6" />
      <path d="M11 6l-6 6 6 6" />
    </svg>
  )
}

function PreviousPageIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  )
}

function NextPageIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <path d="M9 6l6 6-6 6" />
    </svg>
  )
}

function LastPageIcon() {
  return (
    <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
      <path d="M6 6l6 6-6 6" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  )
}
