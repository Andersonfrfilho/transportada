/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import type { CargoVolumeFactor } from '@/modules/company-settings/shared/cargoVolumeFactor.validation'
import { formatCargoVolumeField, parseCargoVolumeField } from '../shared/cargoVolumeField.service'
import styles from '../styles/distributionSettings.module.css'

type CargoVolumeFactorPanelProps = Readonly<{
  canManage: boolean
  current: CargoVolumeFactor | null
  factors: readonly CargoVolumeFactor[]
  loading: boolean
  onClear: () => void
  onSave: (volumePerUnitM3: string) => void
  saving: boolean
}>

/**
 * Spec 077: o fator de cubagem por espécie, ao lado do peso padrão — os dois estimam a mesma coisa
 * a partir do mesmo `qVol` da nota.
 *
 * ⚠️ **Sem `settings.manage` o painel fica somente-leitura, e não desaparece** (D1): quem monta
 * viagem precisa saber por que a ocupação diz 28%, mesmo sem poder mudar o número. Esconder o
 * painel esconderia a origem do valor.
 *
 * ⚠️ **Desligar é apagar a linha**, nunca gravar zero: o CHECK do banco recusa zero, e zero diria
 * que a carga não ocupa espaço nenhum.
 */
export function CargoVolumeFactorPanel({
  canManage,
  current,
  factors,
  loading,
  onClear,
  onSave,
  saving,
}: CargoVolumeFactorPanelProps) {
  const { t } = useTranslation('nfeWorkspace')
  const [typed, setTyped] = useState('')

  useEffect(() => {
    /** Abre **preenchido**: campo em branco sobre dado que existe é a falha que o registro evita. */
    setTyped(current === null ? '' : formatCargoVolumeField(current.volumePerUnitM3))
  }, [current])

  if (loading) {
    return (
      <SkeletonGroup label={t('cargoVolumeTitle')}>
        <Skeleton variant="text" width="14rem" />
        <Skeleton variant="text" width="70%" />
        <Skeleton height="var(--field-height)" width="12rem" />
      </SkeletonGroup>
    )
  }

  const decimal = parseCargoVolumeField(typed)
  const invalid = typed.trim().length > 0 && decimal === null

  return (
    <section aria-labelledby="cargo-volume-title" className={styles.panel}>
      <h3 id="cargo-volume-title">{t('cargoVolumeTitle')}</h3>
      <p className={styles.hint}>{t('cargoVolumeHint')}</p>

      <label className={styles.field} htmlFor="cargo-volume-factor">
        {t('cargoVolumeLabel')}
        <input
          aria-describedby={invalid ? 'cargo-volume-error' : undefined}
          aria-invalid={invalid}
          disabled={!canManage || saving}
          id="cargo-volume-factor"
          inputMode="decimal"
          onChange={(event) => setTyped(event.target.value)}
          value={typed}
        />
      </label>
      {invalid ? (
        <p className={styles.hint} id="cargo-volume-error" role="alert">
          {t('cargoVolumeInvalid')}
        </p>
      ) : null}

      {factors.length > 1 ? (
        <p className={styles.hint}>{t('cargoVolumeSpeciesCount', { count: factors.length })}</p>
      ) : (
        <p className={styles.hint}>{t('cargoVolumeDefaultSpecies')}</p>
      )}

      {canManage ? (
        <div className={styles.actions}>
          <Button
            disabled={decimal === null || saving}
            onClick={() => {
              if (decimal !== null) onSave(decimal)
            }}
            size="sm"
            type="button"
          >
            {t('cargoVolumeSave')}
          </Button>
          {current === null ? null : (
            <Button onClick={onClear} size="sm" type="button" variant="ghost">
              {t('cargoVolumeClear')}
            </Button>
          )}
        </div>
      ) : (
        <p className={styles.hint}>{t('cargoVolumeReadOnly')}</p>
      )}
    </section>
  )
}
