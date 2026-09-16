/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import styles from '../styles/distributionSettings.module.css'

type CameraMeasurementSettingsPanelProps = Readonly<{
  disabled: boolean
  enabled: boolean | undefined
  loading: boolean
  onToggle: (nextEnabled: boolean) => void
  toggleErrorCode: string | undefined
}>

function CameraMeasurementSettingsSkeleton() {
  const { t } = useTranslation('nfeWorkspace')
  return (
    <SkeletonGroup label={t('cameraMeasurementTitle')}>
      <Skeleton variant="text" width="16rem" />
      <Skeleton variant="text" width="80%" />
      <Skeleton height="var(--field-height)" width="12rem" />
    </SkeletonGroup>
  )
}

/**
 * Spec 152 D14: o interruptor por empresa da medida de caixa pela câmera — experimental e
 * desligada por padrão em toda instalação (D13). Só decide se a etapa Medida existe para o
 * conferente; não mede nada aqui.
 */
export function CameraMeasurementSettingsPanel(props: CameraMeasurementSettingsPanelProps) {
  const { t } = useTranslation('nfeWorkspace')

  if (props.loading) return <CameraMeasurementSettingsSkeleton />

  const enabled = props.enabled ?? false

  return (
    <section className={styles.settingsPanel} aria-labelledby="camera-measurement-title">
      <h2 id="camera-measurement-title">{t('cameraMeasurementTitle')}</h2>
      <p className={styles.fieldHint}>{t('cameraMeasurementHint')}</p>
      <p className={styles.fieldHint}>
        <Icon name="camera" /> {t('cameraMeasurementExperimental')}
      </p>
      <p className={enabled ? styles.formStatusSuccess : styles.fieldHint}>
        {t(enabled ? 'cameraMeasurementOn' : 'cameraMeasurementOff')}
      </p>
      <div className={styles.actionRow}>
        <button
          className={enabled ? styles.secondaryAction : styles.primaryAction}
          disabled={props.disabled}
          onClick={() => props.onToggle(!enabled)}
          type="button"
        >
          <Icon name="power" />
          {t(enabled ? 'cameraMeasurementDisable' : 'cameraMeasurementEnable')}
        </button>
      </div>
      {props.toggleErrorCode !== undefined && (
        <p className={styles.formStatusError} role="alert">
          {t('cameraMeasurementToggleError', { code: props.toggleErrorCode })}
        </p>
      )}
    </section>
  )
}
