/* Copyright (c) 2026 Ada Technology. MIT License. */
import { NotificationSettingsWorkspace } from '@adatechnology/notification-ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { validateEmailHtml } from '../shared/emailHtml.validation'

import {
  NOTIFICATION_PREVIEW_PAYLOAD,
  NOTIFICATION_WORKSPACE_HREF,
  buildNotificationSettingsOptions,
} from '../shared/notificationCatalog.constant'
import styles from '../styles/notification.module.css'

export function NotificationSettingsPage(): ReactNode {
  const { t } = useTranslation('notification')
  const { categories, channels } = buildNotificationSettingsOptions((key) => t(key))

  function renderHeader(): ReactNode {
    return (
      <header className={styles.notificationHeader}>
        <div className={styles.notificationHeading}>
          <h1 className={styles.notificationTitle}>{t('settings.title')}</h1>
          <p className={styles.notificationSubtitle}>{t('settings.subtitle')}</p>
        </div>
        <Button asChild size="sm" variant="secondary">
          <a href={NOTIFICATION_WORKSPACE_HREF}>{t('settings.backLabel')}</a>
        </Button>
      </header>
    )
  }

  return (
    <main className={styles.notificationShell} aria-label={t('settings.title')}>
      <NotificationSettingsWorkspace
        categories={categories}
        channels={channels}
        previewPayload={NOTIFICATION_PREVIEW_PAYLOAD}
        validateEmailHtml={validateEmailHtml}
        renderHeader={renderHeader}
      />
    </main>
  )
}
