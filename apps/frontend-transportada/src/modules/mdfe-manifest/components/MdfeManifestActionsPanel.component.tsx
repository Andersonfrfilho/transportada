/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { MdfeManifestActionFormController } from '../hooks/useMdfeManifestActionForm.hook'
import { MDFE_CANCELLATION_JUSTIFICATION_MAX_LENGTH } from '../shared/mdfeManifest.constant'
import type { MdfeAttemptKind } from '../shared/mdfeManifest.types'
import styles from '../styles/mdfeManifest.module.css'

const LOCALE_SCOPE_BY_KIND: Readonly<Record<MdfeAttemptKind, string>> = {
  cancel: 'cancellation',
  close: 'closure',
  issue: 'issue',
}

type MdfeManifestActionsPanelProps = Readonly<{
  form: MdfeManifestActionFormController
  isPending: boolean
  onConfirm: () => void
}>

export function MdfeManifestActionsPanel({
  form,
  isPending,
  onConfirm,
}: MdfeManifestActionsPanelProps) {
  const { t } = useTranslation('mdfeManifest')
  const pending = form.pendingAction
  if (pending === null) return null

  const fiscal = pending.manifest.fiscalNumber ?? pending.manifest.id
  const scope = LOCALE_SCOPE_BY_KIND[pending.kind]
  const isBlocked =
    (pending.kind === 'close' && form.closureIssue !== null) ||
    (pending.kind === 'cancel' && form.cancellationIssue !== null)

  return (
    <section className={styles.actionForm} aria-labelledby="mdfe-manifest-action-title">
      <h3 id="mdfe-manifest-action-title">{t(`${scope}.title`, { fiscal })}</h3>
      <p className={styles.hint}>{t(`${scope}.warning`)}</p>

      {pending.kind === 'close' ? (
        <>
          <label>
            {t('closure.cityCode')}
            <input
              inputMode="numeric"
              maxLength={7}
              onChange={(event) => form.setClosureCityCode(event.target.value)}
              value={form.closureCityCode}
            />
          </label>
          <label>
            {t('closure.state')}
            <input
              maxLength={2}
              onChange={(event) => form.setClosureState(event.target.value.toUpperCase())}
              value={form.closureState}
            />
          </label>
          {form.closureIssue === null ? null : (
            <p className={styles.alert} role="alert">
              {t(`closure.${form.closureIssue}`)}
            </p>
          )}
        </>
      ) : null}

      {pending.kind === 'cancel' ? (
        <>
          <label>
            {t('cancellation.justification')}
            <textarea
              maxLength={MDFE_CANCELLATION_JUSTIFICATION_MAX_LENGTH}
              onChange={(event) => form.setJustification(event.target.value)}
              placeholder={t('cancellation.placeholder')}
              value={form.justification}
            />
          </label>
          {form.cancellationIssue === null ? null : (
            <p className={styles.alert} role="alert">
              {t(`cancellation.${form.cancellationIssue}`)}
            </p>
          )}
        </>
      ) : null}

      <div className={styles.actionActions}>
        <Button disabled={isBlocked || isPending} onClick={onConfirm} size="sm" type="button">
          {t('actions.confirm')}
        </Button>
        <Button onClick={form.dismiss} size="sm" type="button" variant="ghost">
          {t('actions.dismiss')}
        </Button>
      </div>
    </section>
  )
}
