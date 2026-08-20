/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import { FLEET_FIELD_ENTRY_MODE } from '../shared/fleet.types'
import {
  resolveMunicipalityEntryMode,
  type MunicipalityChoice,
} from '../shared/municipality.service'
import styles from '../styles/fleet.module.css'

const CITY_MAX_LENGTH = 120

type DriverCityFieldProps = Readonly<{
  choices: readonly MunicipalityChoice[]
  hasState: boolean
  isLoading: boolean
  label: string
  onChange: (value: string) => void
  value: string
}>

/**
 * Município é lista fechada do IBGE, estreitada pela UF já escolhida — sem ela, e sem provedor no
 * ar, o campo volta a ser teclado: cadastro de motorista não pode parar porque a lista não veio.
 */
export function DriverCityField({
  choices,
  hasState,
  isLoading,
  label,
  onChange,
  value,
}: DriverCityFieldProps) {
  const { t } = useTranslation('fleet')
  const mode = resolveMunicipalityEntryMode({
    choiceCount: choices.length,
    hasState,
    isLoading,
  })

  function renderControl(): ReactNode {
    if (isLoading) {
      return (
        <SkeletonGroup label={t('loading')}>
          <Skeleton height="var(--field-height)" width="100%" />
        </SkeletonGroup>
      )
    }
    if (mode === FLEET_FIELD_ENTRY_MODE.TEXT) {
      return (
        <input
          maxLength={CITY_MAX_LENGTH}
          type="text"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )
    }
    return (
      <Select
        ariaLabel={label}
        clearable
        options={choices}
        placeholder={t('driverAddressCityUnset')}
        searchPlaceholder={t('driverAddressCitySearch')}
        value={value}
        onChange={onChange}
      />
    )
  }

  return (
    <label>
      <span>
        {label}
        <em className={styles.optionalMark}>{t('optionalMark')}</em>
      </span>
      {renderControl()}
      {hasState ? null : (
        <small className={styles.fieldHint}>{t('driverAddressCityStateFirst')}</small>
      )}
    </label>
  )
}
