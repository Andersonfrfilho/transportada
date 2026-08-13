/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { useFloatingLayer } from '@/components/ui/useFloatingLayer.hook'

import type { NfseInvoiceTableController } from '../hooks/useNfseInvoiceTable.hook'
import styles from '../styles/nfseInvoice.module.css'

type NfseInvoiceColumnsMenuProps = Readonly<{
  table: NfseInvoiceTableController
}>

/** Dentro do painel rolável um popover absoluto era recortado: ele vive em portal no body. */
export function NfseInvoiceColumnsMenu({ table }: NfseInvoiceColumnsMenuProps): JSX.Element {
  const { t } = useTranslation('nfseInvoice')
  const [isOpen, setIsOpen] = useState(false)
  const { anchorRef, layerRef, layerStyle } = useFloatingLayer<HTMLDivElement>({
    align: 'end',
    isOpen,
    onDismiss: () => setIsOpen(false),
  })

  const order = table.columnPreferences.order

  return (
    <div className={styles.columnsMenuWrap} ref={anchorRef}>
      <button
        aria-expanded={isOpen}
        aria-label={t('table.columnsMenu')}
        className={isOpen ? styles.iconActionActive : styles.iconAction}
        onClick={() => setIsOpen(!isOpen)}
        title={t('table.columnsMenu')}
        type="button"
      >
        <Icon name="columns" />
      </button>
      {isOpen
        ? createPortal(
            <div className={styles.columnsPopover} ref={layerRef} role="menu" style={layerStyle}>
              {order.map((column, index) => (
                <div className={styles.columnRow} key={column}>
                  <span className={styles.checkOption}>
                    <Checkbox
                      checked={table.columnPreferences.visibility[column]}
                      label={t(`columns.${column}`)}
                      onChange={(isVisible) => table.hideColumn(column, isVisible)}
                    />
                  </span>
                  <span className={styles.columnReorder}>
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
