/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

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

const SORTABLE_COLUMNS: readonly CargoArrivalSortColumn[] = [
  'contractor',
  'arrivedAt',
  'documents',
  'progress',
  'dueAt',
  'status',
]

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
      <table className={tableStyles.table}>
        <thead>
          <tr>
            {SORTABLE_COLUMNS.map((column) => (
              <CargoSortHeader
                column={column}
                key={column}
                label={t(`table.${column}`)}
                onToggle={table.toggleSort}
                sort={table.state.sort}
              />
            ))}
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
