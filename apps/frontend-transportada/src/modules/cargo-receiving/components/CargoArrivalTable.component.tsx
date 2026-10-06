/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

import type { CargoArrivalTableController } from '../hooks/useCargoArrivalTable.hook'
import type { CargoArrivalSummary } from '../shared/cargoArrival.types'
import type { CargoArrivalSortColumn } from '../shared/cargoArrivalTable.service'
import tableStyles from '../styles/cargoTable.module.css'
import { CargoArrivalRow } from './CargoArrivalRow.component'
import { CargoSortHeader } from './CargoSortHeader.component'

type CargoArrivalTableProps = Readonly<{
  arrivals: readonly CargoArrivalSummary[]
  canManage: boolean
  onOpen: (arrivalId: string) => void
  onSeparate: (arrivalId: string) => void
  table: CargoArrivalTableController
}>

/** Notas e progresso são contagens que o servidor não ordena: cabeçalho sem botão, nunca ordem só das páginas carregadas. */
const COLUMNS = [
  { key: 'contractor', sortColumn: 'contractor' },
  { key: 'arrivedAt', sortColumn: 'arrivedAt' },
  { key: 'documents' },
  { key: 'progress' },
  { key: 'dueAt', sortColumn: 'dueAt' },
  { key: 'status', sortColumn: 'status' },
] as const satisfies readonly Readonly<{ key: string; sortColumn?: CargoArrivalSortColumn }>[]

export function CargoArrivalTable({
  arrivals,
  canManage,
  onOpen,
  onSeparate,
  table,
}: CargoArrivalTableProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')

  return (
    <div
      aria-label={t('table.region')}
      className={tableStyles.tableScroll}
      role="region"
      tabIndex={0}
    >
      <table className={cn(tableStyles.table, tableStyles.stacked)}>
        <thead>
          <tr>
            {COLUMNS.map((column) =>
              'sortColumn' in column ? (
                <CargoSortHeader
                  column={column.sortColumn}
                  key={column.key}
                  label={t(`table.${column.key}`)}
                  onToggle={table.toggleSort}
                  sort={table.state.sort}
                />
              ) : (
                <th key={column.key} scope="col">
                  {t(`table.${column.key}`)}
                </th>
              ),
            )}
            <th scope="col">{t('table.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {arrivals.map((arrival) => (
            <CargoArrivalRow
              arrival={arrival}
              canManage={canManage}
              key={arrival.id}
              onOpen={onOpen}
              onSeparate={onSeparate}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
