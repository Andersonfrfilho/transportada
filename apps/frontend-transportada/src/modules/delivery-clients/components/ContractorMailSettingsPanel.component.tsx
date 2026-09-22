/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type FormEvent, type JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/ui/copy-button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { resolveRetryAfterMinutes } from '@/modules/shared/retryAfter.service'

import {
  contractorMailCheckKeyLocaleKey,
  contractorMailCheckReasonLocaleKey,
  contractorMailCheckStatusIcon,
  isContractorMailTestEmailButtonVisible,
  sortContractorMailChecks,
} from '../shared/contractorMailChecklist.service'
import {
  buildContractorMailSettingsSubmission,
  buildContractorMailWebhookUrl,
  toContractorMailSettingsDraft,
  type ContractorMailSettingsBlockReason,
  type ContractorMailSettingsDraft,
} from '../shared/contractorMailSettingsForm.service'
import type { ContractorMailSettingsSaveBody } from '../shared/contractorMailSettingsClient.service'
import type {
  ContractorMailCheckItem,
  ContractorMailSettingsSummary,
} from '../shared/contractorMailSettings.types'
import styles from '../styles/contractorMailSettings.module.css'

const BLOCK_REASON_LOCALE_KEY: Readonly<Record<ContractorMailSettingsBlockReason, string>> = {
  replyDomainInvalid: 'contractorMail.blockedReplyDomainInvalid',
  secretsRequiredFirstSave: 'contractorMail.blockedSecretsRequiredFirstSave',
  senderAddressRequired: 'contractorMail.blockedSenderAddressRequired',
  senderNameRequired: 'contractorMail.blockedSenderNameRequired',
  webhookSecretInvalid: 'contractorMail.blockedWebhookSecretInvalid',
}

const CHECKLIST_ICON_CLASS: Readonly<Record<ContractorMailCheckItem['status'], string>> = {
  failed: styles.checklistIconFailed ?? '',
  ok: styles.checklistIconOk ?? '',
  pending: '',
}

type ContractorMailSettingsPanelProps = Readonly<{
  apiUrl: string
  checks: readonly ContractorMailCheckItem[] | undefined
  checksLoading: boolean
  disabled: boolean
  errorCode: string | undefined
  loading: boolean
  onRefreshChecks: () => void
  onSave: (body: ContractorMailSettingsSaveBody) => void
  onSendTestEmail: () => void
  saved: boolean
  summary: ContractorMailSettingsSummary | null | undefined
  testEmailErrorCode: string | undefined
  testEmailErrorRetryAfterSeconds: number | undefined
  testEmailPending: boolean
  testEmailSent: boolean
}>

function SettingsSkeleton(): JSX.Element {
  const { t } = useTranslation('deliveryClients')
  return (
    <SkeletonGroup label={t('contractorMail.title')}>
      <Skeleton height="var(--field-height)" width="100%" />
      <Skeleton height="var(--field-height)" width="100%" />
      <Skeleton height="var(--field-height)" width="100%" />
      <Skeleton height="var(--field-height)" width="12rem" />
    </SkeletonGroup>
  )
}

function ChecklistSkeleton(): JSX.Element {
  const { t } = useTranslation('deliveryClients')
  return (
    <SkeletonGroup label={t('contractorMail.checklistLoading')}>
      <Skeleton height="var(--space-8)" width="100%" />
      <Skeleton height="var(--space-8)" width="100%" />
      <Skeleton height="var(--space-8)" width="100%" />
    </SkeletonGroup>
  )
}

function ChecklistItem({ item }: Readonly<{ item: ContractorMailCheckItem }>): JSX.Element {
  const { t } = useTranslation('deliveryClients')
  const iconName = contractorMailCheckStatusIcon(item.status)
  const iconClassName = `${styles.checklistIcon ?? ''} ${CHECKLIST_ICON_CLASS[item.status]}`.trim()

  return (
    <li className={styles.checklistItem}>
      <span className={iconClassName}>
        <Icon name={iconName} />
      </span>
      <span className={styles.checklistLabel}>{t(contractorMailCheckKeyLocaleKey(item.key))}</span>
      <p className={styles.checklistReason}>{t(contractorMailCheckReasonLocaleKey(item.reason))}</p>
    </li>
  )
}

/**
 * Spec 143 (P0): a página de configuração do e-mail com contratantes. O rascunho lê o resumo na
 * montagem — a `key` no componente pai é o que evita ele abrir vazio sobre um cadastro existente.
 */
export function ContractorMailSettingsPanel(props: ContractorMailSettingsPanelProps): JSX.Element {
  const { t } = useTranslation('deliveryClients')
  const [draft, setDraft] = useState<ContractorMailSettingsDraft>(() =>
    toContractorMailSettingsDraft(props.summary),
  )
  const [blockReason, setBlockReason] = useState<ContractorMailSettingsBlockReason | undefined>(
    undefined,
  )
  const checks = props.checks === undefined ? [] : sortContractorMailChecks(props.checks)
  const canSendTestEmail = isContractorMailTestEmailButtonVisible(checks)

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const submission = buildContractorMailSettingsSubmission({
      draft,
      existingVersion: props.summary?.version,
    })
    if (submission.status === 'blocked') {
      setBlockReason(submission.reason)
      return
    }
    setBlockReason(undefined)
    setDraft({ ...draft, apiKey: '', webhookSigningSecret: '' })
    props.onSave(submission.body)
  }

  return (
    <div className={styles.settingsDeck}>
      <section aria-labelledby="contractor-mail-settings-title" className={styles.settingsPanel}>
        <h2 id="contractor-mail-settings-title">{t('contractorMail.title')}</h2>
        <p className={styles.fieldHint}>{t('contractorMail.hint')}</p>
        {props.loading ? (
          <SettingsSkeleton />
        ) : (
          <form onSubmit={handleSubmit}>
            <div className={styles.fieldGrid}>
              <label>
                <span>{t('contractorMail.senderAddress')}</span>
                <input
                  disabled={props.disabled}
                  onChange={(event) => setDraft({ ...draft, senderAddress: event.target.value })}
                  type="email"
                  value={draft.senderAddress}
                />
              </label>
              <label>
                <span>{t('contractorMail.senderName')}</span>
                <input
                  disabled={props.disabled}
                  onChange={(event) => setDraft({ ...draft, senderName: event.target.value })}
                  value={draft.senderName}
                />
              </label>
              <label>
                <span>{t('contractorMail.replyDomain')}</span>
                <input
                  disabled={props.disabled}
                  onChange={(event) => setDraft({ ...draft, replyDomain: event.target.value })}
                  value={draft.replyDomain}
                />
                <p className={styles.fieldHint}>{t('contractorMail.replyDomainHint')}</p>
              </label>
              <label>
                <span>{t('contractorMail.apiKey')}</span>
                <input
                  autoComplete="off"
                  disabled={props.disabled}
                  onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
                  type="password"
                  value={draft.apiKey}
                />
                <p className={styles.fieldHint}>{t('contractorMail.apiKeyHint')}</p>
              </label>
              <label className={styles.fieldWide}>
                <span>{t('contractorMail.webhookSigningSecret')}</span>
                <input
                  autoComplete="off"
                  disabled={props.disabled}
                  onChange={(event) =>
                    setDraft({ ...draft, webhookSigningSecret: event.target.value })
                  }
                  type="password"
                  value={draft.webhookSigningSecret}
                />
                <p className={styles.fieldHint}>{t('contractorMail.webhookSigningSecretHint')}</p>
              </label>
            </div>
            <button className={styles.primaryAction} disabled={props.disabled} type="submit">
              <Icon name="save" />
              {t('contractorMail.save')}
            </button>
          </form>
        )}
        {blockReason !== undefined && (
          <p className={styles.formStatusError} role="alert">
            {t(BLOCK_REASON_LOCALE_KEY[blockReason])}
          </p>
        )}
        {props.saved && <p className={styles.formStatusSuccess}>{t('contractorMail.saved')}</p>}
        {props.errorCode !== undefined && (
          <p className={styles.formStatusError} role="alert">
            {t('contractorMail.error', { code: props.errorCode })}
          </p>
        )}
      </section>

      <section aria-labelledby="contractor-mail-webhook-title" className={styles.settingsPanel}>
        <h2 id="contractor-mail-webhook-title">{t('contractorMail.webhookTitle')}</h2>
        {props.summary?.webhookId === undefined || props.summary === null ? (
          <p className={styles.fieldHint}>{t('contractorMail.webhookPendingFirstSave')}</p>
        ) : (
          <div className={styles.webhookRow}>
            <code className={styles.webhookUrl}>
              {buildContractorMailWebhookUrl({
                apiUrl: props.apiUrl,
                webhookId: props.summary.webhookId,
              })}
            </code>
            <CopyButton
              copiedLabel={t('contractorMail.webhookCopiedLabel')}
              label={t('contractorMail.webhookCopyLabel')}
              value={buildContractorMailWebhookUrl({
                apiUrl: props.apiUrl,
                webhookId: props.summary.webhookId,
              })}
            />
          </div>
        )}
        <p className={styles.fieldHint}>{t('contractorMail.webhookInstructions')}</p>
      </section>

      <section
        aria-labelledby="contractor-mail-checklist-title"
        className={styles.settingsPanel}
        id="contractor-mail-checklist-section"
      >
        <h2 id="contractor-mail-checklist-title">{t('contractorMail.checklistTitle')}</h2>
        {props.checksLoading ? (
          <ChecklistSkeleton />
        ) : (
          <ul className={styles.checklist}>
            {checks.map((item) => (
              <ChecklistItem item={item} key={item.key} />
            ))}
          </ul>
        )}
        <div className={styles.actionsRow}>
          {canSendTestEmail && (
            <button
              className={styles.secondaryAction}
              disabled={props.testEmailPending}
              onClick={props.onSendTestEmail}
              type="button"
            >
              <Icon name="send" />
              {props.testEmailPending
                ? t('contractorMail.sendingTestEmail')
                : t('contractorMail.sendTestEmail')}
            </button>
          )}
          <button
            className={styles.secondaryAction}
            disabled={props.checksLoading}
            onClick={props.onRefreshChecks}
            type="button"
          >
            <Icon name="refresh" />
            {t('contractorMail.refreshChecks')}
          </button>
        </div>
        {props.testEmailSent && (
          <p className={styles.formStatusSuccess}>{t('contractorMail.testEmailSent')}</p>
        )}
        {props.testEmailErrorCode !== undefined && (
          <p className={styles.formStatusError} role="alert">
            {props.testEmailErrorCode === 'TOO_MANY_REQUESTS'
              ? t('contractorMail.testEmailTooManyRequests', {
                  minutes:
                    props.testEmailErrorRetryAfterSeconds === undefined
                      ? undefined
                      : resolveRetryAfterMinutes(props.testEmailErrorRetryAfterSeconds),
                })
              : t('contractorMail.testEmailError', { code: props.testEmailErrorCode })}
          </p>
        )}
      </section>
    </div>
  )
}
