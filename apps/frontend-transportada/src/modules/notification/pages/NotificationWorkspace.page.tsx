/* Copyright (c) 2026 Ada Technology. MIT License. */
import { NotificationsWorkspace } from '@adatechnology/notification-ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { NOTIFICATION_SETTINGS_HREF } from '../shared/notificationCatalog.constant'
import styles from '../styles/notification.module.css'

export function NotificationWorkspacePage(): ReactNode {
  const { t } = useTranslation('notification')

  /*
   * O workspace já desenha um `<h1>`, porque ele é a tela. Entregar o nosso pelo slot substitui o
   * dele em vez de somar — dois títulos iguais é o mesmo que nenhum para leitor de tela. O link de
   * preferências vem junto: ele morava no cabeçalho que acabou de ser substituído.
   */
  function renderHeader(): ReactNode {
    return (
      <header className={styles.notificationHeader}>
        <div className={styles.notificationHeading}>
          <h1 className={styles.notificationTitle}>{t('title')}</h1>
          <p className={styles.notificationSubtitle}>{t('subtitle')}</p>
        </div>
        <Button asChild size="sm" variant="secondary">
          <a href={NOTIFICATION_SETTINGS_HREF}>{t('settingsLink')}</a>
        </Button>
      </header>
    )
  }

  return (
    <main className={styles.notificationShell} aria-label={t('title')}>
      <NotificationsWorkspace renderEmpty={() => <p>{t('empty')}</p>} renderHeader={renderHeader} />
    </main>
  )
}
