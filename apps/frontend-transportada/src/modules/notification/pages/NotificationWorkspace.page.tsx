/* Copyright (c) 2026 Ada Technology. MIT License. */
import { NotificationsWorkspace } from '@adatechnology/notification-ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import styles from '../styles/notification.module.css'

export function NotificationWorkspacePage(): ReactNode {
  const { t } = useTranslation('notification')

  return (
    <main className={styles.notificationShell} aria-label={t('title')}>
      <header className={styles.notificationHeader}>
        <h1 className={styles.notificationTitle}>{t('title')}</h1>
        <p className={styles.notificationSubtitle}>{t('subtitle')}</p>
      </header>
      <NotificationsWorkspace renderEmpty={() => <p>{t('empty')}</p>} />
    </main>
  )
}
