/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { MdfeManifestTableController } from '../hooks/useMdfeManifestTable.hook'
import styles from '../styles/mdfeManifest.module.css'

type MdfeManifestColumnsMenuProps = Readonly<{ table: MdfeManifestTableController }>

export function MdfeManifestColumnsMenu({ table }: MdfeManifestColumnsMenuProps) {
  const { t } = useTranslation('mdfeManifest')
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
