/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import {
  resolveVehicleCatalogEntryMode,
  VEHICLE_CATALOG_ENTRY_MODE,
  VEHICLE_CATALOG_OTHER_VALUE,
  type VehicleCatalogChoice,
  type VehicleCatalogEntryMode,
} from '../shared/vehicleCatalogChoices.service'
import styles from '../styles/fleet.module.css'

const NAME_MAX_LENGTH = 120

type VehicleCatalogFieldProps = Readonly<{
  choices: readonly VehicleCatalogChoice[]
  disabled: boolean
  hint?: string
  /** Provedor fora do ar: o que sobra na lista é a frota, e o campo não finge ser o catálogo. */
  isCatalogUnavailable: boolean
  isLoading: boolean
  label: string
  onChange: (value: string) => void
  value: string
}>

/**
 * Marca e modelo saem de uma lista quando alguém os tem, e do teclado quando ninguém tem. A troca é
 * do operador, não da tela: ele escolhe "Outro" com o CRLV na mão, e volta para a lista se errou.
 *
 * O rótulo, o campo e o rodapé são os três trilhos do `subgrid` da fileira — botão e aviso dividem
 * o terceiro, ou a fileira inteira desalinha.
 */
export function VehicleCatalogField({
  choices,
  disabled,
  hint,
  isCatalogUnavailable,
  isLoading,
  label,
  onChange,
  value,
}: VehicleCatalogFieldProps) {
  const { t } = useTranslation('fleet')
  const [override, setOverride] = useState<VehicleCatalogEntryMode | undefined>(undefined)
  const mode = resolveVehicleCatalogEntryMode({
    choiceCount: choices.length,
    isCatalogUnavailable,
    isDisabled: disabled,
    isLoading,
    ...(override === undefined ? {} : { override }),
  })

  function handleSelect(next: string): void {
    if (next === VEHICLE_CATALOG_OTHER_VALUE) {
      setOverride(VEHICLE_CATALOG_ENTRY_MODE.TEXT)
      onChange('')
      return
    }
    onChange(next)
  }

  function handleBackToList(): void {
    setOverride(VEHICLE_CATALOG_ENTRY_MODE.LIST)
    onChange('')
  }

  function renderControl(): ReactNode {
    if (isLoading) {
      return (
        <SkeletonGroup label={t('loading')}>
          <Skeleton height="var(--field-height)" width="100%" />
        </SkeletonGroup>
      )
    }
    if (mode === VEHICLE_CATALOG_ENTRY_MODE.TEXT) {
      return (
        <input
          maxLength={NAME_MAX_LENGTH}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    }
    return (
      <Select
        ariaLabel={label}
        disabled={disabled}
        options={[
          ...choices,
          { label: t('catalogOtherOption'), value: VEHICLE_CATALOG_OTHER_VALUE },
        ]}
        value={value}
        onChange={handleSelect}
      />
    )
  }

  function renderFooter(): ReactNode {
    const canReturn = mode === VEHICLE_CATALOG_ENTRY_MODE.TEXT && choices.length > 0
    if (!canReturn && hint === undefined) return null

    return (
      <span className={styles.catalogFieldFooter}>
        {canReturn ? (
          <Button size="sm" type="button" variant="ghost" onClick={handleBackToList}>
            {t('catalogBackToList')}
          </Button>
        ) : null}
        {hint === undefined ? null : <small className={styles.fieldHint}>{hint}</small>}
      </span>
    )
  }

  return (
    <label>
      <span>{label}</span>
      {renderControl()}
      {renderFooter()}
    </label>
  )
}
