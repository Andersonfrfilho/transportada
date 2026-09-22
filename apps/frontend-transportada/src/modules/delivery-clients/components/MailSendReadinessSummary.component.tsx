/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { revealPanel } from '@/modules/shared/useRevealedPanel.hook'

import { useContractorMailSettings } from '../hooks/useContractorMailSettings.hook'
import { useContractorMailTemplates } from '../hooks/useContractorMailTemplates.hook'
import {
  isMailRoundTripConfigured,
  mailSendReadinessReasonLocaleKey,
  resolveMailSendReadinessShortcutTarget,
  resolveMailSendReadinessView,
  type MailSendReadinessShortcutTarget,
} from '../shared/mailSendReadiness.service'
import styles from '../styles/contractorMailSettings.module.css'

const SHORTCUT_TARGET_ELEMENT_ID: Readonly<Record<MailSendReadinessShortcutTarget, string>> = {
  checklist: 'contractor-mail-checklist-section',
  templates: 'contractor-mail-templates-section',
}

/** O mesmo gesto de rolar+focar de `useRevealedPanel` — aqui disparado por clique, não por montagem. */
function revealShortcutTarget(target: MailSendReadinessShortcutTarget): void {
  const element = document.getElementById(SHORTCUT_TARGET_ELEMENT_ID[target])
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
  const catalog = useContractorMailTemplates({ enabled, mailType: undefined })
  const mailType = catalog.catalogQuery.data?.[0]?.mailType
  const templates = useContractorMailTemplates({
    enabled: enabled && mailType !== undefined,
    mailType,
  })

  const isLoading =
    settings.settingsQuery.isLoading ||
    settings.checksQuery.isLoading ||
    catalog.catalogQuery.isLoading ||
    templates.templatesQuery.isLoading

  if (!enabled) return null

  if (isLoading || mailType === undefined) {
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
    mailType,
    settings: settings.settingsQuery.data ?? null,
    templates: templates.templatesQuery.data ?? [],
  })
  const roundTripConfigured = isMailRoundTripConfigured(settings.settingsQuery.data ?? null)

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
            onClick={() =>
              revealShortcutTarget(resolveMailSendReadinessShortcutTarget(view.reason))
            }
            type="button"
          >
            {t(
              `contractorMail.sendReadiness.shortcut.${resolveMailSendReadinessShortcutTarget(view.reason)}`,
            )}
          </button>
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
