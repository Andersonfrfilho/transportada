/* Copyright (c) 2026 Ada Technology. MIT License. */
import { NotificationBell, NotificationList } from '@adatechnology/notification-ui'
import { useState, type JSX } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { useFloatingLayer } from '@/components/ui/useFloatingLayer.hook'

import { NOTIFICATION_THEME_CLASS } from '../shared/notificationTheme.constant'
import styles from '../styles/notification.module.css'

type NotificationBellMenuProps = Readonly<{
  /** Abre a página completa; o painel fecha antes, para não ficar aberto sobre a tela nova. */
  onViewAll: () => void
}>

/**
 * O sino abre um painel com as notificações mais recentes em vez de navegar. A página completa
 * continua a um clique, em "Ver todas". O painel vive em portal: o cabeçalho tem ancestrais com
 * `overflow` e um absoluto seria recortado.
 */
export function NotificationBellMenu({ onViewAll }: NotificationBellMenuProps): JSX.Element {
  const { t } = useTranslation('notification')
  const [isOpen, setIsOpen] = useState(false)
  const { anchorRef, layerRef, layerStyle } = useFloatingLayer<HTMLDivElement>({
    align: 'end',
    isOpen,
    onDismiss: () => setIsOpen(false),
  })

  function viewAll(): void {
    setIsOpen(false)
    onViewAll()
  }

  return (
    <div className={styles.notificationBellAnchor} ref={anchorRef}>
      <NotificationBell
        className={styles.notificationBell ?? ''}
        onClick={() => setIsOpen(!isOpen)}
      />
      {isOpen
        ? createPortal(
            <section
              aria-label={t('popover.title')}
              className={`${styles.notificationPopover ?? ''} ${NOTIFICATION_THEME_CLASS}`}
              ref={layerRef}
              style={layerStyle}
            >
              <header className={styles.notificationPopoverHeader}>
                <h2 className={styles.notificationPopoverTitle}>{t('popover.title')}</h2>
                <Button onClick={viewAll} size="sm" type="button" variant="secondary">
                  {t('popover.viewAll')}
                </Button>
              </header>
              <div className={styles.notificationPopoverBody}>
                <NotificationList renderEmpty={() => <p>{t('empty')}</p>} />
              </div>
            </section>,
            document.body,
          )
        : null}
    </div>
  )
}
