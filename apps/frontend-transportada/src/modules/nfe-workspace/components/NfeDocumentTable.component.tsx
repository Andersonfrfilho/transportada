/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { CountBadge } from '@/components/ui/count-badge'
import { FilterPills, countFilterPills, type FilterPill } from '@/components/ui/filter-pills'
import { Icon } from '@/components/ui/icon'
import { Select, type SelectOption } from '@/components/ui/select'
import { Tooltip } from '@/components/ui/tooltip'
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'
import { NfseEmissionAction } from '@/modules/nfse-invoice/components/NfseEmissionAction.component'
import { buildNfseInvoiceDetailHref } from '@/modules/nfse-invoice/shared/nfseInvoiceRoute.service'
import { buildTripRoute } from '@/modules/trip/shared/tripRoute.service'

import {
  describeNfeDocumentFilterPills,
  type NfeDocumentFilterPill,
} from '../shared/nfeDocumentFilterPills.service'
import { NFSE_LINK_BLOCK_REASON } from '../shared/nfeWorkspace.constant'
import type { NfeDocumentListItem } from '../shared/nfeWorkspaceClient.service'
import {
  PAGE_SIZE_OPTIONS,
  isDocumentBlocked,
  useNfeDocumentTable,
  type ColumnKey,
  type DocumentStatus,
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
import { NfeDocumentFilterPanel } from './NfeDocumentFilterPanel.component'
import { MultiVehicleSuggestionAction } from '@/modules/routing/components/MultiVehicleSuggestionAction.component'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'
import { navigateToTrip } from '@/modules/trip/shared/tripRoute.service'

import { CopyButton } from './CopyButton.component'
import { CteEmissionDialog } from './CteEmissionDialog.component'

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
  /** O vocabulário de estado da viagem é do módulo dela: copiar as chaves daria duas grafias. */
  const { t: tTrip } = useTranslation('trip')
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
  // O par remetente/destinatário decide quais notas caem no mesmo CT-e agrupado — é o que a fila de
  // emissão precisa saber para fatiar a seleção sem partir um par entre duas requisições.
  const groupKeyByDocumentId = useMemo(
    () =>
      new Map(
        documents.map((document) => [
          document.id,
          `${document.emitterTaxId}|${document.recipientTaxId}`,
        ]),
      ),
    [documents],
  )
  const cteEmission = useCteEmissionDialog({
    ...(companyId === undefined ? {} : { companyId }),
    documentIds: [...table.selectedIds],
    groupKeyByDocumentId,
    onEmitted: table.clearSelection,
    permissions,
  })

  const visibleColumns = table.columnOrder.filter((column) => table.isColumnVisible(column))
  const columnSpan = visibleColumns.length + 2

  const pageSizeOptions: readonly SelectOption[] = PAGE_SIZE_OPTIONS.map((size) => ({
    label: t('documents.perPage', { count: size }),
    value: String(size),
  }))

  const descriptors =
    table.mode === 'advanced'
      ? []
      : describeNfeDocumentFilterPills({ filters: table.filters, formatDay })
  const showAdvancedPill = table.mode === 'simple' && table.savedConditionCount > 0
  const pills: readonly FilterPill[] = [
    ...(showAdvancedPill ? [savedAdvancedPill()] : []),
    ...descriptors.map(toPill),
  ]
  const filterCount =
    table.mode === 'advanced' ? table.activeConditionCount : countFilterPills(pills)

  function toPill(descriptor: NfeDocumentFilterPill): FilterPill {
    const label = t(descriptor.labelKey)
    const value = descriptor.valueKey === undefined ? descriptor.value : t(descriptor.valueKey)
    return {
      id: descriptor.key,
      label,
      onRemove: () => table.clearFilter(descriptor.key),
      removeLabel: t('documents.removeFilter', { field: label }),
      value,
    }
  }

  /** O filtro avançado salvo não é campo simples: sua pílula reabre o construtor em vez de editar em linha. */
  function savedAdvancedPill(): FilterPill {
    return {
      count: table.savedConditionCount,
      editLabel: t('documents.builder.editSaved'),
      id: 'advanced-filter',
      label: t('documents.builder.savedLabel'),
      onEdit: table.editSavedAdvancedFilter,
      onRemove: table.clearSavedAdvancedFilter,
      removeLabel: t('documents.builder.removeSaved'),
      value: t('documents.builder.savedPill', { count: table.savedConditionCount }),
    }
  }

  function handleBulkDownload(): void {
    for (const item of table.visibleSelected()) onDownloadXml(item)
  }

  function copyableCell(column: ColumnKey, display: string, className?: string) {
    const value = display.trim()
    return (
      <td className={className}>
        <div className={styles.copyCell}>
          <span className={styles.copyCellValue} title={value.length > 0 ? value : undefined}>
            {display}
          </span>
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
    const nfseLink = resolveNfseLink(document)
    return (
      <td>
        <span className={`${styles.badge} ${DOCUMENT_STATUS_TONE[document.status] ?? ''}`}>
          {statusLabels[document.status]}
        </span>
        {nfseLink !== null && (
          <Tooltip label={nfseLink.label}>
            <a aria-label={nfseLink.label} className={styles.nfseLink} href={nfseLink.href}>
              <Icon name="invoice" />
            </a>
          </Tooltip>
        )}
        {nfseLink === null && document.cteBlockReason !== null && (
          <Tooltip label={t('documents.blockedRow')}>
            <span className={`${styles.badge} ${styles.badgeMuted}`}>
              {blockReasonLabel(document.cteBlockReason)}
            </span>
          </Tooltip>
        )}
        {/*
          Spec 065 D4b: fatura-se o que saiu. O sinal vem **depois** do bloqueio de propósito — ele
          não é bloqueio nenhum, e a nota que rodou é justamente a que deve entrar no lote.
        */}
        {document.tripId === null ? null : (
          <Tooltip label={tripLinkLabel(document.tripStatus)}>
            <a
              aria-label={tripLinkLabel(document.tripStatus)}
              className={styles.nfseLink}
              href={buildTripRoute(document.tripId)}
            >
              <Icon name="workspace-trip" />
            </a>
          </Tooltip>
        )}
      </td>
    )
  }

  /**
   * O vínculo com a nota de serviço vira ícone: a frase inteira ocupava mais espaço que o status e
   * se repetia linha após linha. O número só existe depois que a prefeitura autoriza.
   */
  function resolveNfseLink(
    document: NfeDocumentListItem,
  ): null | Readonly<{ href: string; label: string }> {
    if (document.cteBlockReason !== NFSE_LINK_BLOCK_REASON) return null
    if (document.nfseInvoiceId === null) return null
    return {
      href: buildNfseInvoiceDetailHref(document.nfseInvoiceId),
      label:
        document.nfseInvoiceNumber === null
          ? t('documents.nfseLinkPending')
          : t('documents.nfseLink', { number: document.nfseInvoiceNumber }),
    }
  }

  /**
   * O ícone diz que a nota **está em viagem**, e em que pé ela está. Antes ele dizia só "Saiu nesta
   * viagem" — passado, e sem o estado: quem varre a listagem não sabia se a carga ainda estava no
   * galpão ou já na rua sem abrir a viagem.
   *
   * Status desconhecido cai no texto sem estado, nunca na chave crua: rótulo de status novo entra
   * no `status.*` do módulo de viagem, e até entrar o operador lê uma frase, não um identificador.
   */
  function tripLinkLabel(status: null | string): string {
    if (status === null) return t('documents.tripLink')
    const label = tTrip(`status.${status}`, { defaultValue: '' })
    return label === ''
      ? t('documents.tripLink')
      : t('documents.tripLinkWithStatus', { status: label })
  }

  function blockReasonLabel(reason: string): string {
    return t(`cteEmission.blockReason.${reason}`, { defaultValue: reason })
  }

  function renderLocationCell(address: string | null, city: string | null, state: string | null) {
    const location = formatLocation(city, state)
    return (
      <td className={styles.locationCell}>
        <span title={address ?? undefined}>{address ?? '—'}</span>
        {location.length > 0 && (
          <span className={styles.locationMeta} title={location}>
            {location}
          </span>
        )}
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
          <Icon name="search" />
          <input
            aria-label={t('documents.search')}
            className={styles.tableSearchInput}
            onChange={(event) => table.setSearchTerm(event.target.value)}
            placeholder={t('documents.searchPlaceholder')}
            type="search"
            value={table.searchTerm}
          />
        </div>
        <Tooltip label={isFilterOpen ? t('filters.toggleClose') : t('filters.toggle')}>
          <button
            aria-expanded={isFilterOpen}
            aria-label={isFilterOpen ? t('filters.toggleClose') : t('filters.toggle')}
            className={isFilterOpen ? styles.iconActionActive : styles.iconAction}
            onClick={() => setIsFilterOpen((open) => !open)}
            type="button"
          >
            <Icon name="filter" />
            <CountBadge count={filterCount} />
          </button>
        </Tooltip>
        <div className={styles.columnsMenuWrap}>
          <Tooltip label={t('documents.columnsMenu')}>
            <button
              aria-expanded={isColumnsMenuOpen}
              aria-label={t('documents.columnsMenu')}
              className={isColumnsMenuOpen ? styles.iconActionActive : styles.iconAction}
              onClick={() => setIsColumnsMenuOpen((open) => !open)}
              type="button"
            >
              <Icon name="columns" />
            </button>
          </Tooltip>
          {isColumnsMenuOpen && (
            <div className={styles.columnsMenu} role="menu">
              {table.columnOrder.map((column, index) => (
                <div className={styles.columnRow} key={column}>
                  <span className={styles.checkOption}>
                    <Checkbox
                      checked={table.isColumnVisible(column)}
                      label={t(`documents.columns.${column}`)}
                      onChange={() => table.toggleColumn(column)}
                    />
                  </span>
                  <div className={styles.columnReorder}>
                    <Tooltip label={t('documents.columnsReorder.moveUp')}>
                      <button
                        aria-label={t('documents.columnsReorder.moveUp')}
                        className={styles.iconAction}
                        disabled={index === 0}
                        onClick={() => table.moveColumn(column, 'up')}
                        type="button"
                      >
                        <Icon name="arrow-up" />
                      </button>
                    </Tooltip>
                    <Tooltip label={t('documents.columnsReorder.moveDown')}>
                      <button
                        aria-label={t('documents.columnsReorder.moveDown')}
                        className={styles.iconAction}
                        disabled={index === table.columnOrder.length - 1}
                        onClick={() => table.moveColumn(column, 'down')}
                        type="button"
                      >
                        <Icon name="arrow-down" />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Com pílula na tela o "limpar tudo" já está lá embaixo: o ícone só cobre busca e ordenação. */}
        {pills.length === 0 && table.hasActiveFilters && (
          <Tooltip label={t('documents.clearAll')}>
            <button
              aria-label={t('documents.clearAll')}
              className={styles.iconAction}
              onClick={table.clearAllFilters}
              type="button"
            >
              <Icon name="filter-clear" />
            </button>
          </Tooltip>
        )}
      </div>

      {isFilterOpen && <NfeDocumentFilterPanel table={table} />}

      <FilterPills
        clearAllLabel={t('documents.clearAll')}
        onClearAll={table.clearAllFilters}
        pills={pills}
      />

      {table.selectedCount > 0 && (
        <div className={styles.selectionBar} role="status">
          <span>{t('documents.selectedCount', { count: table.selectedCount })}</span>
          {table.blockedCount > 0 && (
            <span className={styles.selectionBlocked}>
              {t('documents.blockedCount', { count: table.blockedCount })}
            </span>
          )}
          <div className={styles.selectionActions}>
            {/* Sem dica: o texto dela seria o próprio rótulo ao lado, e dica que repete é ruído. */}
            {cteEmission.canEmit && (
              <button className={styles.labelActionActive} onClick={cteEmission.open} type="button">
                <Icon name="send" />
                {t('documents.emitCte', { count: table.selectedCount })}
              </button>
            )}
            {/*
              Spec 058 P2: distribuir a seleção entre veículos. A ação nasce da seleção porque é
              aqui que o operador já escolheu as notas — uma tela própria seria esta mesma tabela,
              de novo, sem os filtros que ele acabou de usar.
            */}
            <MultiVehicleSuggestionAction
              className={styles.labelActionActive}
              {...(companyId === undefined ? {} : { companyId })}
              documentIds={[...table.selectedIds]}
              onAccepted={table.clearSelection}
              onOpenTrip={(tripId) =>
                navigateToTrip({ navigator: createBrowserWorkspaceNavigator(), tripId })
              }
              permissions={permissions}
            />
            <NfseEmissionAction
              className={styles.labelActionActive}
              {...(companyId === undefined ? {} : { companyId })}
              documentIds={[...table.selectedIds]}
              onEmitted={table.clearSelection}
              permissions={permissions}
            />
            <Tooltip label={t('documents.downloadSelected')}>
              <button
                aria-label={t('documents.downloadSelected')}
                className={styles.iconAction}
                onClick={handleBulkDownload}
                type="button"
              >
                <Icon name="download" />
              </button>
            </Tooltip>
            <Tooltip label={t('documents.clearSelection')}>
              <button
                aria-label={t('documents.clearSelection')}
                className={styles.iconAction}
                onClick={table.clearSelection}
                type="button"
              >
                <Icon name="close" />
              </button>
            </Tooltip>
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
                    <Checkbox
                      ariaLabel={t('documents.selectAll')}
                      checked={table.allSelected}
                      indeterminate={table.someSelected}
                      onChange={() => table.toggleSelectAll()}
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
                  const blocked = isDocumentBlocked(document)
                  return (
                    <tr className={selected ? styles.rowSelected : undefined} key={document.id}>
                      <td
                        className={styles.selectCell}
                        title={
                          document.cteBlockReason === null
                            ? undefined
                            : blockReasonLabel(document.cteBlockReason)
                        }
                      >
                        <Checkbox
                          ariaLabel={blocked ? t('documents.blockedRow') : t('documents.selectRow')}
                          checked={selected}
                          disabled={blocked}
                          onChange={() => table.toggleRow(document.id)}
                        />
                      </td>
                      {visibleColumns.map((column) => (
                        <RenderCellSlot key={column}>{renderCell(column, document)}</RenderCellSlot>
                      ))}
                      <td>
                        <Tooltip
                          label={
                            downloading
                              ? t('documents.downloadPending')
                              : t('documents.downloadXml')
                          }
                        >
                          <button
                            aria-label={t('documents.downloadXml')}
                            className={styles.iconAction}
                            disabled={downloading}
                            onClick={() => onDownloadXml(document)}
                            type="button"
                          >
                            <Icon name="download" />
                          </button>
                        </Tooltip>
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
              <Select
                align="end"
                ariaLabel={t('documents.pageSize')}
                clearable={false}
                compact
                onChange={(value) => table.setPageSize(Number(value))}
                options={pageSizeOptions}
                placeholder={t('documents.pageSize')}
                value={String(table.pageSize)}
              />
              <Tooltip label={t('documents.firstPage')}>
                <button
                  aria-label={t('documents.firstPage')}
                  className={styles.iconAction}
                  disabled={table.safePage === 0}
                  onClick={() => table.setPage(0)}
                  type="button"
                >
                  <Icon name="page-first" />
                </button>
              </Tooltip>
              <Tooltip label={t('documents.previousPage')}>
                <button
                  aria-label={t('documents.previousPage')}
                  className={styles.iconAction}
                  disabled={table.safePage === 0}
                  onClick={() => table.setPage(table.safePage - 1)}
                  type="button"
                >
                  <Icon name="page-previous" />
                </button>
              </Tooltip>
              <span className={styles.pageIndicator}>
                {t('documents.pageIndicator', {
                  current: table.safePage + 1,
                  total: table.pageCount,
                })}
              </span>
              <Tooltip label={t('documents.nextPage')}>
                <button
                  aria-label={t('documents.nextPage')}
                  className={styles.iconAction}
                  disabled={table.safePage >= table.pageCount - 1}
                  onClick={() => table.setPage(table.safePage + 1)}
                  type="button"
                >
                  <Icon name="page-next" />
                </button>
              </Tooltip>
              <Tooltip label={t('documents.lastPage')}>
                <button
                  aria-label={t('documents.lastPage')}
                  className={styles.iconAction}
                  disabled={table.safePage >= table.pageCount - 1}
                  onClick={() => table.setPage(table.pageCount - 1)}
                  type="button"
                >
                  <Icon name="page-last" />
                </button>
              </Tooltip>
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
        <Icon name="sort" />
      </button>
    </th>
  )
}
