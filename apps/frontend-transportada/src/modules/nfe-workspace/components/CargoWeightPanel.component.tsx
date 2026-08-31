/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import styles from '../styles/distributionSettings.module.css'

type CargoWeightPanelProps = Readonly<{
  defaultVolumeWeight: string | null
  disabled: boolean
  loading: boolean
  onSave: (defaultVolumeWeight: string | null) => void
}>

const WEIGHT_PATTERN = /^(?:0|[1-9][0-9]{0,9})(?:[.,][0-9]{1,4})?$/

/** Quatro casas, como o peso do volume no banco — a API recusa qualquer outra escala. */
function toApiWeight(value: string): string | null {
  const trimmed = value.trim()
  if (!WEIGHT_PATTERN.test(trimmed)) return null
  const parsed = Number.parseFloat(trimmed.replace(',', '.'))
  return parsed > 0 ? parsed.toFixed(4) : null
}

function CargoWeightSkeleton() {
  const { t } = useTranslation('nfeWorkspace')
  return (
    <SkeletonGroup label={t('cargoWeightTitle')}>
      <Skeleton variant="text" width="16rem" />
      <Skeleton variant="text" width="80%" />
      <Skeleton height="var(--field-height)" width="12rem" />
    </SkeletonGroup>
  )
}

export function CargoWeightPanel({
  defaultVolumeWeight,
  disabled,
  loading,
  onSave,
}: CargoWeightPanelProps) {
  const { t } = useTranslation('nfeWorkspace')
  const [draft, setDraft] = useState(defaultVolumeWeight ?? '')
  const parsed = toApiWeight(draft)
  const invalid = draft.trim().length > 0 && parsed === null

  if (loading) return <CargoWeightSkeleton />

  return (
    <section className={styles.settingsPanel}>
      <h3>{t('cargoWeightTitle')}</h3>
      <p className={styles.fieldHint}>{t('cargoWeightHelp')}</p>
      <p className={defaultVolumeWeight === null ? styles.fieldHint : styles.formStatusSuccess}>
        {defaultVolumeWeight === null
          ? t('cargoWeightDisabled')
          : t('cargoWeightEnabled', { weight: defaultVolumeWeight })}
      </p>
      <label htmlFor="cargo-default-volume-weight">{t('cargoWeightLabel')}</label>
      <input
        aria-describedby={invalid ? 'cargo-default-volume-weight-error' : undefined}
        aria-invalid={invalid}
        disabled={disabled}
        id="cargo-default-volume-weight"
        inputMode="decimal"
        onChange={(event) => setDraft(event.target.value)}
        value={draft}
      />
      {invalid ? (
        <p className={styles.formStatusError} id="cargo-default-volume-weight-error" role="alert">
          {t('cargoWeightInvalid')}
        </p>
      ) : null}
      <div className={styles.actionRow}>
        <button
          className={styles.primaryAction}
          disabled={disabled || parsed === null}
          onClick={() => onSave(parsed)}
          type="button"
        >
          {t('cargoWeightSave')}
        </button>
        <button
          className={styles.secondaryAction}
          disabled={disabled || defaultVolumeWeight === null}
          onClick={() => {
            setDraft('')
            onSave(null)
          }}
          type="button"
        >
          {t('cargoWeightClear')}
        </button>
      </div>
    </section>
  )
}
