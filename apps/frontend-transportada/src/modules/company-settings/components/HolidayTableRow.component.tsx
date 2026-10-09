/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import { HOLIDAY_PROVENANCE } from '../shared/holidayImport.constant'
import type { HolidayRow } from '../shared/businessCalendarRows.service'
import type { HolidaySortColumn } from '../shared/businessCalendarTable.service'
import styles from '../styles/businessCalendar.module.css'

import { HolidayOriginBadge } from './HolidayOriginBadge.component'

export type HolidayTableNamespace = 'municipal' | 'state'

type HolidayTableRowProps = Readonly<{
  columns: readonly HolidaySortColumn[]
  describeWhen: (row: HolidayRow) => string
  namespace: HolidayTableNamespace
  onDelete: (row: HolidayRow) => void
  onEdit: (row: HolidayRow) => void
  row: HolidayRow
}>

/** Cada célula leva o rótulo da coluna (`data-label`): abaixo de 40 rem a linha vira cartão. */
export function HolidayTableRow({
  columns,
  describeWhen,
  namespace,
  onDelete,
  onEdit,
  row,
}: HolidayTableRowProps) {
  const { t } = useTranslation('businessCalendar')
  const isImported = row.provenance === HOLIDAY_PROVENANCE.IMPORTED
  const cells: Readonly<Record<HolidaySortColumn, string>> = {
    date: describeWhen(row),
    kind: t(`kinds.${row.kind}`),
    name: row.name,
    place: row.placeLabel,
  }

  return (
    <tr>
      {columns.map((column) => (
        <td
          data-label={t(`${namespace}.table.${column === 'date' ? 'when' : column}`)}
          key={column}
        >
          {cells[column]}
        </td>
      ))}
      <td data-label={t(`${namespace}.table.origin`)}>
        <HolidayOriginBadge provenance={row.provenance} />
      </td>
      <td data-label={t(`${namespace}.table.actions`)}>
        <div className={styles.rowActions}>
          <Button
            aria-label={t('list.editAria', { name: row.name })}
            onClick={() => onEdit(row)}
            type="button"
            variant="ghost"
          >
            <Icon name="edit" />
            {t('list.edit')}
          </Button>
          <Button
            aria-label={t(isImported ? 'list.disableAria' : 'list.deleteAria', { name: row.name })}
            onClick={() => onDelete(row)}
            type="button"
            variant="ghost"
          >
            <Icon name={isImported ? 'eye-off' : 'trash'} />
            {t(isImported ? 'list.disable' : 'list.delete')}
          </Button>
        </div>
      </td>
    </tr>
  )
}
