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
import { useInstallationBrand } from '@/modules/identity/queries/useInstallationBrand.query'

import {
  NOTIFICATION_PRODUCT_NAME,
  NOTIFICATION_PREVIEW_PAYLOAD,
  NOTIFICATION_WORKSPACE_HREF,
  buildNotificationSettingsOptions,
} from '../shared/notificationCatalog.constant'
import { NOTIFICATION_THEME_CLASS } from '../shared/notificationTheme.constant'
import styles from '../styles/notification.module.css'

export function NotificationSettingsPage(): ReactNode {
  const { t } = useTranslation('notification')
  const { categories, channels } = buildNotificationSettingsOptions((key) => t(key))
  /*
   * Sem `senderName` o pacote assina a prévia com a **primeira letra do título** — a fatura vinha
   * como "F". Quem escreve o texto precisa ver o remetente que a pessoa vai ver, e ele é a marca da
   * transportadora, a mesma que a tela de entrar mostra. Enquanto a leitura não chega (ou falha), o
   * nome do produto cobre: é o que o e-mail assina quando a instalação não tem marca cadastrada.
   */
  const installationBrand = useInstallationBrand()
  const senderName = installationBrand.data?.name ?? NOTIFICATION_PRODUCT_NAME
  const senderAddress = import.meta.env.VITE_EMAIL_FROM
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
        /*
         * O endereço do remetente é o mesmo `EMAIL_FROM` que o worker usa. Ausente, o pacote mantém
         * o exemplo dele — e é melhor um exemplo declarado do que um endereço inventado aqui.
         */
        {...(senderAddress === undefined || senderAddress === ''
          ? {}
          : { labels: { 'preview.senderAddress': senderAddress } })}
        previewPayload={NOTIFICATION_PREVIEW_PAYLOAD}
        senderName={senderName}
        renderEditorActions={({ templateKey }) => (
          <SendTemplateTestButton onSend={sendTest} templateKey={templateKey} />
        )}
        validateEmailHtml={validateEmailHtml}
        renderHeader={renderHeader}
      />
    </main>
  )
}
