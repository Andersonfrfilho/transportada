/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { CteBatchTableController } from '../hooks/useCteBatchTable.hook'
import styles from '../styles/cteBatch.module.css'

type CteBatchColumnsMenuProps = Readonly<{ table: CteBatchTableController }>

export function CteBatchColumnsMenu({ table }: CteBatchColumnsMenuProps) {
  const { t } = useTranslation('cteBatch')
  const { order, visibility } = table.columnPreferences

  return (
    <fieldset className={styles.columnsMenu}>
      <legend className={styles.hint}>{t('columns.title')}</legend>
      {order.map((column, index) => (
        <div className={styles.columnsRow} key={column}>
          <label>
            <input
              checked={visibility[column]}
              onChange={(event) => table.hideColumn(column, event.target.checked)}
              type="checkbox"
            />
            {t(`columns.${column}`)}
          </label>
          <span className={styles.bulkActions}>
            <Button
              aria-label={t('column.moveUp')}
              disabled={index === 0}
              onClick={() => table.moveColumn(column, 'up')}
              size="sm"
              type="button"
              variant="ghost"
            >
              ↑
            </Button>
            <Button
              aria-label={t('column.moveDown')}
              disabled={index === order.length - 1}
              onClick={() => table.moveColumn(column, 'down')}
              size="sm"
              type="button"
              variant="ghost"
            >
              ↓
            </Button>
          </span>
        </div>
      ))}
    </fieldset>
  )
}
