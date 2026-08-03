/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'

import type { CteItemTableController } from '../hooks/useCteItemTable.hook'
import styles from '../styles/cteBatch.module.css'

type CteItemColumnsMenuProps = Readonly<{ table: CteItemTableController }>

export function CteItemColumnsMenu({ table }: CteItemColumnsMenuProps) {
  const { t } = useTranslation('cteBatch')

  return (
    <div className={styles.columnsPopover} role="menu">
      {table.columnPreferences.order.map((column, index) => (
        <div className={styles.columnRow} key={column}>
          <span className={styles.checkOption}>
            <Checkbox
              checked={table.columnPreferences.visibility[column]}
              label={t(`cteItems.columns.${column}`)}
              onChange={(checked) => table.hideColumn(column, checked)}
            />
          </span>
          <span className={styles.columnReorder}>
            <button
              aria-label={t('column.moveUp')}
              className={styles.iconAction}
              disabled={index === 0}
              onClick={() => table.moveColumn(column, 'up')}
              title={t('column.moveUp')}
              type="button"
            >
              <Icon name="arrow-up" />
            </button>
            <button
              aria-label={t('column.moveDown')}
              className={styles.iconAction}
              disabled={index === table.columnPreferences.order.length - 1}
              onClick={() => table.moveColumn(column, 'down')}
              title={t('column.moveDown')}
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
