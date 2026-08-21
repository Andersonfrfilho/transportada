/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { CountBadge } from '@/components/ui/count-badge'
import { Icon } from '@/components/ui/icon'

import { useFreightRegionColumns } from '../hooks/useFreightRegionColumns.hook'
import { useFreightRegionForm } from '../hooks/useFreightRegionForm.hook'
import { useFreightRegionTable } from '../hooks/useFreightRegionTable.hook'
import type {
  FreightRegion,
  FreightRegionBodyInput,
  FreightRegionUpdateInput,
} from '../shared/freightRegion.types'
import styles from '../styles/fleet.module.css'
import { FleetEmptyState } from './FleetEmptyState.component'
import { FleetTableSkeleton } from './FleetTableSkeleton.component'
import { FreightRegionColumnsMenu } from './FreightRegionColumnsMenu.component'
import { FreightRegionFilters } from './FreightRegionFilters.component'
import { FreightRegionForm } from './FreightRegionForm.component'
import { FreightRegionImportDialog } from './FreightRegionImportDialog.component'
import { FreightRegionList } from './FreightRegionList.component'
import { FreightRegionMap } from './FreightRegionMap.component'
import { FreightRegionSelectionBar } from './FreightRegionSelectionBar.component'

/** A coluna de seleção é a única fora da lista de colunas escondíveis. */
const FREIGHT_REGION_FIXED_COLUMN_COUNT = 1

type FreightRegionWriteHandlers = Readonly<{
  onCreate: (body: FreightRegionBodyInput) => Promise<unknown>
  onUpdate: (input: FreightRegionUpdateInput) => Promise<unknown>
}>

type FreightRegionEditor =
  | null
  | Readonly<{ kind: 'import' }>
  | Readonly<{
      kind: 'form'
      region?: FreightRegion
    }>

type FreightRegionPanelProps = Readonly<{
  actions: FreightRegionWriteHandlers
  canManageSettings: boolean
  companyId: string | undefined
  loading: boolean
  regions: readonly FreightRegion[] | undefined
}>

/**
 * Ler região é `fleet.read` — a cobertura alimenta o formulário de motorista —, então a aba abre
 * para quem cuida da frota. O que `settings.manage` guarda é a escrita: os botões, a coluna que
 * edita a linha e o diálogo de importação.
 */
export function FreightRegionPanel({
  actions,
  canManageSettings,
  companyId,
  loading,
  regions,
}: FreightRegionPanelProps) {
  const { t } = useTranslation('fleet')
  const table = useFreightRegionTable(regions ?? [])
  const columns = useFreightRegionColumns()
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = useState(false)
  const [editor, setEditor] = useState<FreightRegionEditor>(null)

  function editRegion(region: FreightRegion): void {
    setEditor({ kind: 'form', region })
  }

  function closeEditor(): void {
    setEditor(null)
  }

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
          <FreightRegionWriteActions
            canManageSettings={canManageSettings}
            onImport={() => setEditor({ kind: 'import' })}
            onNew={() => setEditor({ kind: 'form' })}
          />
        </div>
      </div>
      <p className={styles.panelHint}>{t('regions.hint')}</p>
      <FreightRegionFilters table={table} />
      <FreightRegionSelectionBar table={table} />
      <FreightRegionPanelBody
        columnCount={
          FREIGHT_REGION_FIXED_COLUMN_COUNT +
          columns.visibleColumns.length +
          (canManageSettings ? 1 : 0)
        }
        columns={columns.visibleColumns}
        loading={loading}
        table={table}
        {...(canManageSettings ? { onEdit: editRegion } : {})}
      />
      {editor !== null && editor.kind === 'form' ? (
        <FreightRegionEditorDeck
          actions={actions}
          key={editor.region?.id ?? 'new-region'}
          onClose={closeEditor}
          regions={regions ?? []}
          {...(editor.region === undefined ? {} : { region: editor.region })}
        />
      ) : (
        <FreightRegionMap regions={regions ?? []} />
      )}
      {editor !== null && editor.kind === 'import' ? (
        <FreightRegionImportDialog companyId={companyId} onClose={closeEditor} />
      ) : null}
    </section>
  )
}

type FreightRegionWriteActionsProps = Readonly<{
  canManageSettings: boolean
  onImport: () => void
  onNew: () => void
}>

function FreightRegionWriteActions({
  canManageSettings,
  onImport,
  onNew,
}: FreightRegionWriteActionsProps) {
  const { t } = useTranslation('fleet')

  if (!canManageSettings) return null

  return (
    <>
      <Button size="sm" type="button" variant="ghost" onClick={onImport}>
        <Icon name="upload" />
        {t('regions.import')}
      </Button>
      <Button size="sm" type="button" onClick={onNew}>
        <Icon name="add" />
        {t('regions.newRegion')}
      </Button>
    </>
  )
}

type FreightRegionEditorDeckProps = Readonly<{
  actions: FreightRegionWriteHandlers
  onClose: () => void
  region?: FreightRegion
  regions: readonly FreightRegion[]
}>

/**
 * O controlador nasce aqui porque o formulário e o mapa escrevem na mesma lista de cidades: clicar
 * num município acrescenta ou retira a cidade da zona aberta. O `key` de quem monta este bloco é
 * que troca a zona em edição — o estado inicial do hook lê a região uma vez só.
 */
function FreightRegionEditorDeck({
  actions,
  onClose,
  region,
  regions,
}: FreightRegionEditorDeckProps) {
  const form = useFreightRegionForm({
    onCreate: actions.onCreate,
    onSaved: onClose,
    onUpdate: actions.onUpdate,
    ...(region === undefined ? {} : { region }),
  })

  return (
    <>
      <FreightRegionForm
        form={form}
        onCancel={onClose}
        {...(region === undefined ? {} : { region })}
      />
      <FreightRegionMap
        cities={form.state.cities}
        regions={regions}
        onChange={(cities) => form.patch({ cities })}
      />
    </>
  )
}

type FreightRegionPanelBodyProps = Readonly<{
  columnCount: number
  columns: ReturnType<typeof useFreightRegionColumns>['visibleColumns']
  loading: boolean
  onEdit?: (region: FreightRegion) => void
  table: ReturnType<typeof useFreightRegionTable>
}>

function FreightRegionPanelBody({
  columnCount,
  columns,
  loading,
  onEdit,
  table,
}: FreightRegionPanelBodyProps) {
  const { t } = useTranslation('fleet')

  if (loading) return <FleetTableSkeleton columnCount={columnCount} label={t('loading')} />
  if (table.regions.length > 0) {
    return (
      <FreightRegionList
        columns={columns}
        table={table}
        {...(onEdit === undefined ? {} : { onEdit })}
      />
    )
  }
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
