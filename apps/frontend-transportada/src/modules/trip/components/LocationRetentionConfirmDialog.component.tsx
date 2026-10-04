/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type {
  LocationRetentionConfirmation,
  LocationRetentionImpactSummary,
} from '../shared/locationRetention.service'
import styles from '../styles/trip.module.css'

export type LocationRetentionConfirmDialogProps = Readonly<{
  confirmation: LocationRetentionConfirmation | undefined
  impactSummary: LocationRetentionImpactSummary | undefined
  isImpactError: boolean
  isSubmitting: boolean
  onCancel: () => void
  onConfirm: () => void
  retentionDays: number
}>

const NUMBER_FORMAT = new Intl.NumberFormat('pt-BR')
const IMPACT_GROUP_COUNT = 4

/**
 * Spec 239 D5: ligar (ou encurtar) apaga posição para sempre, então o botão destrutivo diz o
 * número e o verbo — nunca "OK" — e só habilita depois que a contagem chegou.
 */
export function LocationRetentionConfirmDialog({
  confirmation,
  impactSummary,
  isImpactError,
  isSubmitting,
  onCancel,
  onConfirm,
  retentionDays,
}: LocationRetentionConfirmDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({
    isOpen: confirmation !== undefined,
    onClose: onCancel,
  })

  if (confirmation === undefined) return null

  const amount =
    impactSummary === undefined
      ? ''
      : impactSummary.isCapped
        ? t('locationRetention.confirm.cappedCount')
        : t('locationRetention.confirm.atLeastCount', {
            formatted: NUMBER_FORMAT.format(impactSummary.total),
          })

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-describedby="location-retention-confirm-intro"
        aria-labelledby="location-retention-confirm-title"
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <h2 id="location-retention-confirm-title">
            {t(`locationRetention.confirm.title.${confirmation}`)}
          </h2>
          <button
            aria-label={t('locationRetention.confirm.close')}
            className={styles.iconAction}
            onClick={onCancel}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <p className={styles.mdfeGateSubtitle}>{t('locationRetention.lgpd')}</p>
        <p className={styles.mdfeGateSubtitle} id="location-retention-confirm-intro">
          {t('locationRetention.confirm.intro', { days: retentionDays })}
        </p>

        {impactSummary === undefined && !isImpactError ? (
          <SkeletonGroup
            className={styles.retentionImpactList}
            label={t('locationRetention.confirm.loading')}
          >
            {Array.from({ length: IMPACT_GROUP_COUNT }, (_, index) => (
              <Skeleton height="var(--control-height-compact)" key={index} width="100%" />
            ))}
          </SkeletonGroup>
        ) : null}
        {isImpactError ? (
          <p className={styles.alert} role="alert">
            {t('locationRetention.confirm.loadError')}
          </p>
        ) : null}
        {impactSummary === undefined ? null : (
          <ul className={styles.retentionImpactList}>
            {impactSummary.groups.map((group) => (
              <li key={group.id}>
                <span>{t(`locationRetention.confirm.groups.${group.id}`)}</span>
                <strong>
                  {group.isCapped
                    ? t('locationRetention.confirm.cappedCount')
                    : NUMBER_FORMAT.format(group.count)}
                </strong>
              </li>
            ))}
          </ul>
        )}

        <p className={styles.mdfeGateSubtitle}>{t('locationRetention.confirm.grace')}</p>

        <footer className={styles.mdfeGateFooter}>
          <Button onClick={onCancel} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('locationRetention.confirm.cancel')}
          </Button>
          <Button
            className={styles.retentionDestructive}
            disabled={isSubmitting || impactSummary === undefined}
            onClick={onConfirm}
            size="sm"
            type="button"
            variant="secondary"
          >
            <Icon name="trash" />
            {impactSummary === undefined
              ? t(`locationRetention.confirm.action.${confirmation}.pending`)
              : t(`locationRetention.confirm.action.${confirmation}.ready`, {
                  amount,
                  count: impactSummary.total,
                })}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
