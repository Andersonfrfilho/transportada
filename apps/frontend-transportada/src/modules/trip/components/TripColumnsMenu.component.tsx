/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { useFloatingLayer } from '@/components/ui/useFloatingLayer.hook'

import type { TripTableController } from '../hooks/useTripTable.hook'
import styles from '../styles/trip.module.css'

type TripColumnsMenuProps = Readonly<{ table: TripTableController }>

/**
 * Mostrar, ocultar e reordenar as colunas da listagem. A escolha é do usuário e fica gravada no
 * navegador (ver `tripColumnsStorageKey`). O menu vive em portal: dentro do painel rolável um
 * popover absoluto seria recortado — mesmo desenho do menu de colunas da NFS-e.
 */
export function TripColumnsMenu({ table }: TripColumnsMenuProps): JSX.Element {
  const { t } = useTranslation('trip')
  const [isOpen, setIsOpen] = useState(false)
  const { anchorRef, layerRef, layerStyle } = useFloatingLayer<HTMLDivElement>({
    align: 'end',
    isOpen,
    onDismiss: () => setIsOpen(false),
  })

  const order = table.manageableColumns
  const lastVisibleColumn = table.columns.length === 1 ? table.columns[0] : undefined

  return (
    <div className={styles.columnsMenuWrap} ref={anchorRef}>
      <button
        aria-expanded={isOpen}
        aria-label={t('columnsMenu.title')}
        className={isOpen ? styles.iconActionActive : styles.iconAction}
        onClick={() => setIsOpen(!isOpen)}
        title={t('columnsMenu.title')}
        type="button"
      >
        <Icon name="columns" />
      </button>
      {isOpen
        ? createPortal(
            <div
              aria-label={t('columnsMenu.title')}
              className={styles.tripColumnsPopover}
              ref={layerRef}
              role="menu"
              style={layerStyle}
            >
              {order.map((column, index) => (
                <div className={styles.tripColumnRow} key={column}>
                  <Checkbox
                    checked={table.columnPreferences.visibility[column]}
                    disabled={lastVisibleColumn === column}
                    label={t(`columns.${column}`)}
                    onChange={() => table.toggleColumnVisibility(column)}
                  />
                  <span className={styles.tripColumnReorder}>
                    <button
                      aria-label={t('columnsMenu.moveUp')}
                      className={styles.iconAction}
                      disabled={index === 0}
                      onClick={() => table.moveColumn(column, 'up')}
                      title={t('columnsMenu.moveUp')}
                      type="button"
                    >
                      <Icon name="arrow-up" size="sm" />
                    </button>
                    <button
                      aria-label={t('columnsMenu.moveDown')}
                      className={styles.iconAction}
                      disabled={index === order.length - 1}
                      onClick={() => table.moveColumn(column, 'down')}
                      title={t('columnsMenu.moveDown')}
                      type="button"
                    >
                      <Icon name="arrow-down" size="sm" />
                    </button>
                  </span>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
