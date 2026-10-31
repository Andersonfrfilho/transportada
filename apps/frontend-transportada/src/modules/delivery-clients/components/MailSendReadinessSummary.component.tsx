/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { navigateToNotificationSettings } from '@/modules/nfe-workspace/shared/deliveryClientsNavigation.service'
import { createBrowserWorkspaceNavigator } from '@/modules/shared/workspaceNavigation.service'
import { revealPanel } from '@/modules/shared/useRevealedPanel.hook'

import { useContractorMailSettings } from '../hooks/useContractorMailSettings.hook'
import {
  isMailRoundTripConfigured,
  mailSendReadinessReasonLocaleKey,
  resolveMailSendReadinessShortcutTarget,
  resolveMailSendReadinessView,
  resolveOccurrenceMailNotice,
  type MailSendReadinessShortcutTarget,
} from '../shared/mailSendReadiness.service'
import styles from '../styles/contractorMailSettings.module.css'

/**
 * A lista de verificação está nesta página: o mesmo gesto de rolar+focar de `useRevealedPanel`, disparado por clique.
 * O modelo do e-mail mora em Notificações (spec 286): o atalho leva para lá.
 */
function followShortcut(target: MailSendReadinessShortcutTarget): void {
  if (target === 'notifications') {
    navigateToNotificationSettings(createBrowserWorkspaceNavigator())
    return
  }
  const element = document.getElementById('contractor-mail-checklist-section')
  if (element !== null) revealPanel(element)
}

type MailSendReadinessSummaryProps = Readonly<{ companyId: string | undefined; enabled: boolean }>

/**
 * Spec 150 T404: resumo "Pronto para enviar" no topo da página "E-mail com contratantes",
 * espelhando `resolveMailSendReadiness` da API (RF16/RF17) sem importar dela. O estado da ida e
 * volta (143) aparece separado, só informativo — nunca bloqueia o envio.
 */
export function MailSendReadinessSummary({
  companyId,
  enabled,
}: MailSendReadinessSummaryProps): JSX.Element | null {
  const { t } = useTranslation('deliveryClients')
  const settings = useContractorMailSettings({
    ...(companyId === undefined ? {} : { companyId }),
    enabled,
  })

  const isLoading =
    settings.settingsQuery.isLoading ||
    settings.checksQuery.isLoading ||
    settings.templateUsableQuery.isLoading

  if (!enabled) return null

  if (isLoading) {
    return (
      <section aria-labelledby="contractor-mail-readiness-title" className={styles.settingsPanel}>
        <h2 id="contractor-mail-readiness-title">{t('contractorMail.sendReadiness.title')}</h2>
        <SkeletonGroup label={t('contractorMail.sendReadiness.loading')}>
          <Skeleton height="var(--space-8)" width="100%" />
        </SkeletonGroup>
      </section>
    )
  }

  const view = resolveMailSendReadinessView({
    checks: settings.checksQuery.data ?? [],
    settings: settings.settingsQuery.data?.summary ?? null,
    templateUsable: settings.templateUsableQuery.data === true,
  })
  const occurrenceMailNotice = resolveOccurrenceMailNotice({
    sandboxDelivery: settings.settingsQuery.data?.sandboxDelivery ?? false,
    settings: settings.settingsQuery.data?.summary ?? null,
  })
  const roundTripConfigured = isMailRoundTripConfigured(
    settings.settingsQuery.data?.summary ?? null,
  )

  return (
    <section aria-labelledby="contractor-mail-readiness-title" className={styles.settingsPanel}>
      <h2 id="contractor-mail-readiness-title">{t('contractorMail.sendReadiness.title')}</h2>
      {view.ready ? (
        <p className={styles.formStatusSuccess}>
          <Icon name="check" />
          {t('contractorMail.sendReadiness.ready')}
        </p>
      ) : (
        <p className={styles.formStatusError} role="alert">
          <Icon name="alert" />
          {t(mailSendReadinessReasonLocaleKey(view.reason))}
          {' — '}
          <button
            className={styles.invalidField}
            onClick={() => followShortcut(resolveMailSendReadinessShortcutTarget(view.reason))}
            type="button"
          >
            {t(
              `contractorMail.sendReadiness.shortcut.${resolveMailSendReadinessShortcutTarget(view.reason)}`,
            )}
          </button>
        </p>
      )}
      {occurrenceMailNotice === 'none' ? null : (
        <p
          className={styles.fieldHint}
          role={occurrenceMailNotice === 'blocked' ? 'alert' : 'status'}
        >
          {t(`contractorMail.sendReadiness.occurrenceMail.${occurrenceMailNotice}`)}
        </p>
      )}
      <p className={styles.fieldHint}>
        {roundTripConfigured
          ? t('contractorMail.sendReadiness.roundTripReady')
          : t('contractorMail.sendReadiness.roundTripPending')}
      </p>
    </section>
  )
}
