/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'

import type { TripOccurrenceTableController } from '../hooks/useTripOccurrenceTable.hook'
import styles from '../styles/trip.module.css'

type TripOccurrenceColumnsMenuProps = Readonly<{ table: TripOccurrenceTableController }>

export function TripOccurrenceColumnsMenu({ table }: TripOccurrenceColumnsMenuProps) {
  const { t } = useTranslation('trip')

  return (
    <div className={styles.columnsPopover} role="menu">
      {table.columnPreferences.order.map((column, index) => (
        <div className={styles.columnRow} key={column}>
          <Checkbox
            checked={table.columnPreferences.visibility[column]}
            label={t(`occurrenceFeed.columns.${column}`)}
            onChange={() => table.toggleColumnVisibility(column)}
          />
          <span className={styles.columnReorder}>
            <button
              aria-label={t('occurrenceFeed.columnsMenu.moveUp')}
              className={styles.iconAction}
              disabled={index === 0}
              onClick={() => table.moveColumn(column, 'up')}
              title={t('occurrenceFeed.columnsMenu.moveUp')}
              type="button"
            >
              <Icon name="arrow-up" />
            </button>
            <button
              aria-label={t('occurrenceFeed.columnsMenu.moveDown')}
              className={styles.iconAction}
              disabled={index === table.columnPreferences.order.length - 1}
              onClick={() => table.moveColumn(column, 'down')}
              title={t('occurrenceFeed.columnsMenu.moveDown')}
              type="button"
            >
              <Icon name="arrow-down" />
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}
