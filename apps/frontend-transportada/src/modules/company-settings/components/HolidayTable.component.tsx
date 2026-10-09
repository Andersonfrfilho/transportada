/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { HolidayTableController } from '../hooks/useHolidayTable.hook'
import type { HolidayRow } from '../shared/businessCalendarRows.service'
import type { HolidaySortColumn, HolidayTableView } from '../shared/businessCalendarTable.service'
import styles from '../styles/businessCalendar.module.css'

import { HolidaySortHeader } from './HolidaySortHeader.component'
import { HolidayTableRow, type HolidayTableNamespace } from './HolidayTableRow.component'

type HolidayTableProps = Readonly<{
  columns: readonly HolidaySortColumn[]
  describeWhen: (row: HolidayRow) => string
  namespace: HolidayTableNamespace
  onDelete: (row: HolidayRow) => void
  onEdit: (row: HolidayRow) => void
  table: HolidayTableController
  view: HolidayTableView
}>

/** Zebra por CSS, cabeçalho ordenável e cartões abaixo de 40 rem (`.stacked` + `data-label` em cada célula). */
export function HolidayTable({
  columns,
  describeWhen,
  namespace,
  onDelete,
  onEdit,
  table,
  view,
}: HolidayTableProps) {
  const { t } = useTranslation('businessCalendar')

  return (
    <div
      aria-label={t(`${namespace}.table.region`)}
      className={styles.tableScroll}
      role="region"
      tabIndex={0}
    >
      <table className={`${styles.table} ${styles.stacked}`}>
        <thead>
          <tr>
            {columns.map((column) => (
              <HolidaySortHeader
                column={column}
                key={column}
                label={t(`${namespace}.table.${column === 'date' ? 'when' : column}`)}
                onToggle={table.toggleSort}
                sort={table.state.sort}
              />
            ))}
            <th scope="col">{t(`${namespace}.table.origin`)}</th>
            <th scope="col">{t(`${namespace}.table.actions`)}</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <HolidayTableRow
              columns={columns}
              describeWhen={describeWhen}
              key={row.id}
              namespace={namespace}
              onDelete={onDelete}
              onEdit={onEdit}
              row={row}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
