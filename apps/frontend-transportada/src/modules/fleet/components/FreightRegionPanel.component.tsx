/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { CountBadge } from '@/components/ui/count-badge'
import { Icon } from '@/components/ui/icon'

import { useFreightRegionColumns } from '../hooks/useFreightRegionColumns.hook'
import { useFreightRegionTable } from '../hooks/useFreightRegionTable.hook'
import type { FreightRegion } from '../shared/freightRegion.types'
import styles from '../styles/fleet.module.css'
import { FleetEmptyState } from './FleetEmptyState.component'
import { FleetTableSkeleton } from './FleetTableSkeleton.component'
import { FreightRegionColumnsMenu } from './FreightRegionColumnsMenu.component'
import { FreightRegionFilters } from './FreightRegionFilters.component'
import { FreightRegionList } from './FreightRegionList.component'
import { FreightRegionSelectionBar } from './FreightRegionSelectionBar.component'

/** A coluna de seleção é a única fora da lista de colunas escondíveis. */
const FREIGHT_REGION_FIXED_COLUMN_COUNT = 1

type FreightRegionPanelProps = Readonly<{
  loading: boolean
  regions: readonly FreightRegion[] | undefined
}>

export function FreightRegionPanel({ loading, regions }: FreightRegionPanelProps) {
  const { t } = useTranslation('fleet')
  const table = useFreightRegionTable(regions ?? [])
  const columns = useFreightRegionColumns()
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = useState(false)

  return (
    <section aria-labelledby="fleet-regions-title" className={styles.panel}>
      <div className={styles.panelHeading}>
        <h2 id="fleet-regions-title">{t('regions.title')}</h2>
        <div className={styles.panelActions}>
          <button
            aria-expanded={table.isFilterPanelOpen}
            aria-label={t('regionFilters.title')}
            className={table.isFilterPanelOpen ? styles.iconActionActive : styles.iconAction}
            title={t('regionFilters.title')}
            type="button"
            onClick={() => table.setFilterPanelOpen(!table.isFilterPanelOpen)}
          >
            <Icon name="filter" />
            <CountBadge count={table.activeFilterCount} />
          </button>
          <span className={styles.columnsMenuWrap}>
            <button
              aria-expanded={isColumnsMenuOpen}
              aria-label={t('columns.title')}
              className={isColumnsMenuOpen ? styles.iconActionActive : styles.iconAction}
              title={t('columns.title')}
              type="button"
              onClick={() => setIsColumnsMenuOpen(!isColumnsMenuOpen)}
            >
              <Icon name="columns" />
            </button>
            {isColumnsMenuOpen ? <FreightRegionColumnsMenu table={columns} /> : null}
          </span>
        </div>
      </div>
      <p className={styles.panelHint}>{t('regions.hint')}</p>
      <FreightRegionFilters table={table} />
      <FreightRegionSelectionBar table={table} />
      <FreightRegionPanelBody
        columnCount={FREIGHT_REGION_FIXED_COLUMN_COUNT + columns.visibleColumns.length}
        columns={columns.visibleColumns}
        loading={loading}
        table={table}
      />
    </section>
  )
}

type FreightRegionPanelBodyProps = Readonly<{
  columnCount: number
  columns: ReturnType<typeof useFreightRegionColumns>['visibleColumns']
  loading: boolean
  table: ReturnType<typeof useFreightRegionTable>
}>

function FreightRegionPanelBody({
  columnCount,
  columns,
  loading,
  table,
}: FreightRegionPanelBodyProps) {
  const { t } = useTranslation('fleet')

  if (loading) return <FleetTableSkeleton columnCount={columnCount} label={t('loading')} />
  if (table.regions.length > 0) return <FreightRegionList columns={columns} table={table} />
  if (table.totalCount > 0) {
    return (
      <FleetEmptyState
        action={{ icon: 'close', label: t('clearFilters'), onAction: table.clearFilters }}
        description={t('filtersEmptyHint')}
        title={t('filtersEmptyTitle')}
      />
    )
  }

  return <FleetEmptyState description={t('regions.emptyHint')} title={t('regions.emptyTitle')} />
}
