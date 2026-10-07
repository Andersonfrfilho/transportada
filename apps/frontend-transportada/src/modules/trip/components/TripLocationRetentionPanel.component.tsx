/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { useLocationRetentionPanel } from '../hooks/useLocationRetentionPanel.hook'
import { LOCATION_RETENTION_DAYS_RANGE } from '../shared/locationRetention.constant'
import { formatLocationRetentionMoment } from '../shared/locationRetention.service'
import styles from '../styles/trip.module.css'

import { LocationRetentionConfirmDialog } from './LocationRetentionConfirmDialog.component'

type TripLocationRetentionPanelProps = Readonly<{
  canManage: boolean
  /** Aba aberta: junto de `canManage`, é o que liga a consulta (`SETTINGS_PANEL_PLACEMENT`). */
  isEnabled: boolean
}>

function LocationRetentionSkeleton() {
  const { t } = useTranslation('trip')
  return (
    <SkeletonGroup className={styles.retentionSkeleton} label={t('locationRetention.loading')}>
      <Skeleton height="var(--space-4)" variant="text" width="14rem" />
      <div className={styles.fieldGrid}>
        <div className={styles.retentionSkeletonField}>
          <Skeleton height="var(--space-4)" variant="text" width="9rem" />
          <Skeleton height="var(--field-height)" width="100%" />
        </div>
      </div>
      <div className={styles.actionActions}>
        <Skeleton height="var(--control-height-compact)" width="11rem" />
        <Skeleton height="var(--control-height-compact)" width="8rem" />
      </div>
    </SkeletonGroup>
  )
}

/**
 * Spec 239 (D5, D7): quanto tempo a posição do evento fica guardada. Mora na aba Localização das
 * viagens — onde o "Localização apagada" da linha do tempo aparece. Sem linha gravada vale o
 * padrão do sistema (desligado, 90 dias); ligar e encurtar o prazo pedem confirmação com número.
 */
export function TripLocationRetentionPanel({
  canManage,
  isEnabled,
}: TripLocationRetentionPanelProps) {
  const { t } = useTranslation('trip')
  const daysErrorId = useId()
  const panel = useLocationRetentionPanel({ canManage, isEnabled })
  const { pending, settings, status } = panel
  const isInvalid = panel.isDaysInvalid
  const isReady = settings !== undefined && status !== undefined

  return (
    <section aria-labelledby="location-retention-title" className={styles.panel}>
      <h3 className={styles.hint} id="location-retention-title">
        {t('locationRetention.title')}
      </h3>
      <p className={styles.hint}>{t('locationRetention.hint')}</p>

      {canManage ? null : (
        <p className={styles.alert} role="alert">
          {t('locationRetention.forbidden')}
        </p>
      )}
      {canManage && panel.query.isPending ? <LocationRetentionSkeleton /> : null}
      {canManage && panel.query.isError ? (
        <p className={styles.alert} role="alert">
          {t('locationRetention.loadError')}
        </p>
      ) : null}

      {canManage && isReady ? (
        <>
          <p className={status === 'off' ? styles.hint : styles.settingsStatusOn}>
            {t(`locationRetention.status.${status}`, { days: settings.retentionDays })}
          </p>
          {status === 'waiting' && settings.purgeEffectiveAt !== null ? (
            <p className={styles.hint}>
              {t('locationRetention.effectiveAt', {
                moment: formatLocationRetentionMoment(settings.purgeEffectiveAt),
              })}
            </p>
          ) : null}

          <div className={styles.fieldGrid}>
            <label>
              <span className={styles.hint}>{t('locationRetention.daysLabel')}</span>
              <input
                {...(isInvalid ? { 'aria-describedby': daysErrorId } : {})}
                aria-invalid={isInvalid}
                disabled={panel.isSaving}
                max={LOCATION_RETENTION_DAYS_RANGE.max}
                min={LOCATION_RETENTION_DAYS_RANGE.min}
                type="number"
                value={panel.daysText}
                onChange={(event) => panel.handleDaysChange(event.target.value)}
              />
              {isInvalid ? (
                <span className={styles.alert} id={daysErrorId} role="alert">
                  {t('locationRetention.daysRangeError', LOCATION_RETENTION_DAYS_RANGE)}
                </span>
              ) : null}
            </label>
          </div>

          <div className={styles.actionActions}>
            <Button
              disabled={panel.isSaving || (!settings.purgeEnabled && isInvalid)}
              onClick={panel.handleToggle}
              size="sm"
              type="button"
              variant={settings.purgeEnabled ? 'secondary' : 'default'}
            >
              <Icon name="power" />
              {t(settings.purgeEnabled ? 'locationRetention.disable' : 'locationRetention.enable')}
            </Button>
            <Button
              disabled={panel.isSaving || !panel.hasDaysChange}
              onClick={panel.handleSaveDays}
              size="sm"
              type="button"
              variant="secondary"
            >
              <Icon name="save" />
              {t('locationRetention.saveDays')}
            </Button>
            {settings.origin === 'company' ? (
              <Button
                disabled={panel.isSaving}
                onClick={panel.handleClear}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Icon name="refresh" />
                {t('locationRetention.clear')}
              </Button>
            ) : null}
          </div>

          {panel.isSaving ? (
            <p className={styles.hint} role="status">
              {t('locationRetention.saving')}
            </p>
          ) : null}
          {panel.saveMutation.isError || panel.clearMutation.isError ? (
            <p className={styles.alert} role="alert">
              {t('locationRetention.saveError')}
            </p>
          ) : null}

          <p className={styles.hint}>{t('locationRetention.lgpd')}</p>
          <p className={styles.hint}>{t('locationRetention.liveTrail')}</p>
          <p className={styles.hint}>{t('locationRetention.whatsapp')}</p>
        </>
      ) : null}

      <LocationRetentionConfirmDialog
        confirmation={pending?.confirmation}
        impactSummary={panel.impact.summary}
        isImpactError={panel.impact.isError}
        isSubmitting={panel.saveMutation.isPending}
        onCancel={panel.handleCancel}
        onConfirm={panel.handleConfirm}
        retentionDays={pending?.draft.retentionDays ?? LOCATION_RETENTION_DAYS_RANGE.max}
      />
    </section>
  )
}
