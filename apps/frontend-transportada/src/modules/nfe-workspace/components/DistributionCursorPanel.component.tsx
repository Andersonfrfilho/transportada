/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import type { DistributionCursor } from '@/modules/company-settings/shared/companySettingsClient.service'
import {
  DISTRIBUTION_CURSOR_NSU_LENGTH,
  isDistributionCursorNsu,
} from '@/modules/company-settings/shared/distributionCursor.validation'
import styles from '../styles/distributionSettings.module.css'

type DistributionCursorPanelProps = Readonly<{
  adjusted: boolean
  cursor: DistributionCursor | undefined
  disabled: boolean
  errorCode: string | undefined
  loading: boolean
  onAdjust: (ultNsu: string) => void
}>

function useMomentFormatter(): (value: string) => string {
  const { i18n } = useTranslation('nfeWorkspace')
  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
  return (value) => formatter.format(new Date(value))
}

function DistributionCursorSkeleton() {
  const { t } = useTranslation('nfeWorkspace')
  return (
    <SkeletonGroup label={t('distributionCursorTitle')}>
      <Skeleton variant="text" width="16rem" />
      <Skeleton variant="text" width="70%" />
      <Skeleton variant="text" width="55%" />
      <Skeleton height="var(--field-height)" width="16rem" />
    </SkeletonGroup>
  )
}

function DistributionCursorFacts({ cursor }: Readonly<{ cursor: DistributionCursor }>) {
  const { t } = useTranslation('nfeWorkspace')
  const formatMoment = useMomentFormatter()
  return (
    <>
      <p className={styles.scheduledDistributionState}>
        {t('distributionCursorPosition', { nsu: cursor.ultNsu })}
      </p>
      <p className={styles.fieldHint}>{t('distributionCursorMax', { nsu: cursor.maxNsu })}</p>
      <p className={styles.fieldHint}>
        {t('distributionCursorUpdatedAt', { moment: formatMoment(cursor.updatedAt) })}
      </p>
      {cursor.nextAllowedAt !== null && (
        <p className={styles.fieldHint}>
          {t('distributionCursorNextWindow', { moment: formatMoment(cursor.nextAllowedAt) })}
        </p>
      )}
      <p className={styles.fieldHint}>
        {t('distributionCursorRefusals', { count: cursor.consecutiveRateLimits })}
      </p>
      {cursor.lastSkipped === null ? (
        <p className={styles.fieldHint}>{t('distributionCursorNeverSkipped')}</p>
      ) : (
        <p className={styles.fieldHint}>
          {t('distributionCursorLastSkipped', {
            fromNsu: cursor.lastSkipped.fromNsu,
            moment: formatMoment(cursor.lastSkipped.at),
            toNsu: cursor.lastSkipped.toNsu,
          })}
        </p>
      )}
    </>
  )
}

function AdjustmentConfirmation(
  props: Readonly<{
    disabled: boolean
    onCancel: () => void
    onConfirm: () => void
    ultNsu: string
  }>,
) {
  const { t } = useTranslation('nfeWorkspace')
  return (
    <div className={styles.actionRow} role="group">
      <p className={styles.formStatusError} role="status">
        {t('distributionCursorConfirm', { nsu: props.ultNsu })}
      </p>
      <button
        className={styles.primaryAction}
        disabled={props.disabled}
        type="button"
        onClick={props.onConfirm}
      >
        <Icon name="check" />
        {t('distributionCursorSubmit')}
      </button>
      <button className={styles.secondaryAction} type="button" onClick={props.onCancel}>
        <Icon name="close" />
        {t('distributionCursorCancel')}
      </button>
    </div>
  )
}

function AdjustmentForm(
  props: Readonly<{ disabled: boolean; maxNsu: string; onAdjust: (ultNsu: string) => void }>,
) {
  const { t } = useTranslation('nfeWorkspace')
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<string | undefined>(undefined)
  const invalid = draft !== '' && !isDistributionCursorNsu(draft)

  function handleReview() {
    if (isDistributionCursorNsu(draft)) setPending(draft)
  }

  function handleConfirm() {
    if (pending !== undefined) props.onAdjust(pending)
    setPending(undefined)
    setDraft('')
  }

  return (
    <>
      <label htmlFor="distribution-cursor-nsu">{t('distributionCursorFieldLabel')}</label>
      <input
        aria-invalid={invalid}
        disabled={props.disabled}
        id="distribution-cursor-nsu"
        inputMode="numeric"
        maxLength={DISTRIBUTION_CURSOR_NSU_LENGTH}
        value={draft}
        onChange={(event) => setDraft(event.target.value.replace(/\D/gu, ''))}
      />
      <p className={styles.fieldHint}>{t('distributionCursorFieldHint', { nsu: props.maxNsu })}</p>
      {pending === undefined ? (
        <div className={styles.actionRow}>
          <button
            className={styles.primaryAction}
            disabled={props.disabled || !isDistributionCursorNsu(draft)}
            type="button"
            onClick={handleReview}
          >
            <Icon name="refresh" />
            {t('distributionCursorSubmit')}
          </button>
        </div>
      ) : (
        <AdjustmentConfirmation
          disabled={props.disabled}
          ultNsu={pending}
          onCancel={() => setPending(undefined)}
          onConfirm={handleConfirm}
        />
      )}
    </>
  )
}

export function DistributionCursorPanel(props: DistributionCursorPanelProps) {
  const { t } = useTranslation('nfeWorkspace')
  return (
    <section className={styles.settingsPanel} aria-labelledby="distribution-cursor-title">
      <h2 id="distribution-cursor-title">{t('distributionCursorTitle')}</h2>
      <p className={styles.fieldHint}>{t('distributionCursorHint')}</p>
      {props.loading ? (
        <DistributionCursorSkeleton />
      ) : props.cursor === undefined ? (
        <p className={styles.formStatusError} role="alert">
          {t('distributionCursorLoadError')}
        </p>
      ) : (
        <>
          <DistributionCursorFacts cursor={props.cursor} />
          <AdjustmentForm
            disabled={props.disabled}
            maxNsu={props.cursor.maxNsu}
            onAdjust={props.onAdjust}
          />
        </>
      )}
      {props.adjusted && (
        <p className={styles.formStatusSuccess} role="status">
          {t('distributionCursorAdjusted')}
        </p>
      )}
      {props.errorCode !== undefined && (
        <p className={styles.formStatusError} role="alert">
          {t('distributionCursorError', { code: props.errorCode })}
        </p>
      )}
    </section>
  )
}
