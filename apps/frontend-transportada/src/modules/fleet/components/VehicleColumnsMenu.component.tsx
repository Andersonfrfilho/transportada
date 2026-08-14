/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'

import type { VehicleColumnsController } from '../hooks/useVehicleColumns.hook'
import styles from '../styles/fleet.module.css'

type VehicleColumnsMenuProps = Readonly<{ table: VehicleColumnsController }>

export function VehicleColumnsMenu({ table }: VehicleColumnsMenuProps) {
  const { t } = useTranslation('fleet')
  const { order, visibility } = table.columnPreferences

  return (
    <div className={styles.columnsPopover} role="menu">
      {order.map((column, index) => (
        <div className={styles.columnRow} key={column}>
          <span className={styles.checkOption}>
            <Checkbox
              checked={visibility[column]}
              label={t(`columns.${column}`)}
              onChange={(checked) => table.hideColumn(column, checked)}
            />
          </span>
          <span className={styles.columnReorder}>
            <button
              aria-label={t('column.moveUp')}
              className={styles.iconAction}
              disabled={index === 0}
              title={t('column.moveUp')}
              type="button"
              onClick={() => table.moveColumn(column, 'up')}
            >
              <Icon name="arrow-up" />
            </button>
            <button
              aria-label={t('column.moveDown')}
              className={styles.iconAction}
              disabled={index === order.length - 1}
              title={t('column.moveDown')}
              type="button"
              onClick={() => table.moveColumn(column, 'down')}
            >
              <Icon name="arrow-down" />
            </button>
          </span>
        </div>
      ))}
    </div>
  )
}
