/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'

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
          <Checkbox
            checked={visibility[column]}
            label={t(`columns.${column}`)}
            onChange={(checked) => table.hideColumn(column, checked)}
          />
          <span className={styles.bulkActions}>
            <Button
              aria-label={t('column.moveUp')}
              disabled={index === 0}
              onClick={() => table.moveColumn(column, 'up')}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="arrow-up" />
            </Button>
            <Button
              aria-label={t('column.moveDown')}
              disabled={index === order.length - 1}
              onClick={() => table.moveColumn(column, 'down')}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="arrow-down" />
            </Button>
          </span>
        </div>
      ))}
    </fieldset>
  )
}
