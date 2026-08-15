/* Copyright (c) 2026 Ada Technology. MIT License. */
import { NotificationSettingsWorkspace } from '@adatechnology/notification-ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { buildNotificationSettingsOptions } from '../shared/notificationCatalog.constant'
import styles from '../styles/notification.module.css'

export function NotificationSettingsPage(): ReactNode {
  const { t } = useTranslation('notification')
  const { categories, channels } = buildNotificationSettingsOptions((key) => t(key))

  return (
    <main className={styles.notificationShell} aria-label={t('settings.title')}>
      <header className={styles.notificationHeader}>
        <h1 className={styles.notificationTitle}>{t('settings.title')}</h1>
        <p className={styles.notificationSubtitle}>{t('settings.subtitle')}</p>
      </header>
      <NotificationSettingsWorkspace categories={categories} channels={channels} />
    </main>
  )
}
