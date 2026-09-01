/* Copyright (c) 2026 Ada Technology. MIT License. */
import { NotificationSettingsWorkspace } from '@adatechnology/notification-ui'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { SendTemplateTestButton } from '../components/SendTemplateTestButton.component'
import { validateEmailHtml } from '../shared/emailHtml.validation'
import { createTemplateTestClient } from '../shared/templateTestClient.service'
import { getIdentityEnvironment } from '@/modules/identity/shared/identityEnvironment.config'
import { getKeycloakAuthProvider } from '@/modules/identity/shared/KeycloakAuthProvider.provider'

import {
  NOTIFICATION_PREVIEW_PAYLOAD,
  NOTIFICATION_WORKSPACE_HREF,
  buildNotificationSettingsOptions,
} from '../shared/notificationCatalog.constant'
import { NOTIFICATION_THEME_CLASS } from '../shared/notificationTheme.constant'
import styles from '../styles/notification.module.css'

export function NotificationSettingsPage(): ReactNode {
  const { t } = useTranslation('notification')
  const { categories, channels } = buildNotificationSettingsOptions((key) => t(key))
  /**
   * O cliente é montado aqui, e não num hook: ele não tem estado, e a tela é a única consumidora.
   * O token vem do provedor de sessão, como em todo cliente HTTP deste app.
   */
  const sendTest = (templateKey: string): Promise<void> =>
    createTemplateTestClient({
      apiUrl: getIdentityEnvironment().apiBaseUrl,
      fetch: (input, init) => fetch(input, init),
      getAccessToken: () => getKeycloakAuthProvider().getAccessToken(),
    }).sendTest(templateKey)

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
        className={NOTIFICATION_THEME_CLASS}
        categories={categories}
        channels={channels}
        previewPayload={NOTIFICATION_PREVIEW_PAYLOAD}
        renderEditorActions={({ templateKey }) => (
          <SendTemplateTestButton onSend={sendTest} templateKey={templateKey} />
        )}
        validateEmailHtml={validateEmailHtml}
        renderHeader={renderHeader}
      />
    </main>
  )
}
