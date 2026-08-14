/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import type { VehicleCatalogController } from '../hooks/useVehicleCatalog.hook'
import type { FleetVehicleFormState } from '../shared/fleet.types'
import {
  applyVehicleBrand,
  hasVehicleCatalogFailure,
  resolveVehicleCatalogCode,
  resolveVehicleCatalogFieldMode,
  toVehicleCatalogOptions,
  VEHICLE_CATALOG_FIELD_MODE,
} from '../shared/fleetForm.service'
import styles from '../styles/fleet.module.css'
import { FleetField } from './FleetField.component'
import { VehicleColorField } from './VehicleColorField.component'

type VehicleModelFieldsProps = Readonly<{
  catalog: VehicleCatalogController
  onChange: (values: Partial<FleetVehicleFormState>) => void
  state: FleetVehicleFormState
}>

type CatalogOption = Readonly<{ label: string; value: string }>

type CatalogSelectFieldProps = Readonly<{
  field: Readonly<{
    disabled: boolean
    hint: string | undefined
    isLoading: boolean
    label: string
    loadingLabel: string
  }>
  onChange: (value: string) => void
  options: readonly CatalogOption[]
  value: string
}>

const VEHICLE_CATALOG_BRANDS_QUERY_KEY = 'fleet-vehicle-catalog-brands'
const VEHICLE_CATALOG_MODELS_QUERY_KEY = 'fleet-vehicle-catalog-models'

function CatalogSelectField({ field, onChange, options, value }: CatalogSelectFieldProps) {
  return (
    <label>
      <span>{field.label}</span>
      {field.isLoading ? (
        <SkeletonGroup label={field.loadingLabel}>
          <Skeleton height="var(--field-height)" width="100%" />
        </SkeletonGroup>
      ) : (
        <Select
          ariaLabel={field.label}
          disabled={field.disabled}
          options={options}
          value={value}
          onChange={onChange}
        />
      )}
      {field.hint === undefined ? null : <small className={styles.fieldHint}>{field.hint}</small>}
    </label>
  )
}

export function VehicleModelFields({ catalog, onChange, state }: VehicleModelFieldsProps) {
  const { t } = useTranslation('fleet')
  const catalogInput = {
    role: state.role,
    vehicleCatalogEnabled: catalog.canUseCatalog,
    wheelType: state.wheelType,
  }
  const shouldQueryCatalog =
    resolveVehicleCatalogFieldMode({ ...catalogInput, hasCatalogFailure: false }) ===
    VEHICLE_CATALOG_FIELD_MODE.LIST
  const brandsQuery = useQuery({
    enabled: shouldQueryCatalog,
    queryFn: () => catalog.listBrands({ role: state.role, wheelType: state.wheelType }),
    queryKey: [VEHICLE_CATALOG_BRANDS_QUERY_KEY, state.role, state.wheelType],
  })
  const brandCode = resolveVehicleCatalogCode({
    items: brandsQuery.data?.items,
    name: state.brand,
  })
  const modelsQuery = useQuery({
    enabled: shouldQueryCatalog && brandCode !== '',
    queryFn: () =>
      catalog.listModels({ brand: brandCode, role: state.role, wheelType: state.wheelType }),
    queryKey: [VEHICLE_CATALOG_MODELS_QUERY_KEY, state.role, state.wheelType, brandCode],
  })
  const hasCatalogFailure = hasVehicleCatalogFailure({
    isError: brandsQuery.isError,
    source: brandsQuery.data?.source,
  })
  const mode = resolveVehicleCatalogFieldMode({ ...catalogInput, hasCatalogFailure })
  const isBlocked = mode === VEHICLE_CATALOG_FIELD_MODE.BLOCKED
  const isListing = mode === VEHICLE_CATALOG_FIELD_MODE.LIST

  function handleBrandChange(brand: string): void {
    onChange(applyVehicleBrand(state, brand))
  }

  function handleModelChange(model: string): void {
    onChange({ model })
  }

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('vehicleModelLegend')}</legend>
      <div className={styles.fieldGrid}>
        {mode === VEHICLE_CATALOG_FIELD_MODE.TEXT ? (
          <FleetField
            label={t('brand')}
            value={state.brand}
            {...(hasCatalogFailure ? { hint: t('brandCatalogUnavailableHint') } : {})}
            onChange={handleBrandChange}
          />
        ) : (
          <CatalogSelectField
            field={{
              disabled: isBlocked,
              hint: isBlocked ? t('brandCatalogWheelTypeHint') : undefined,
              isLoading: isListing && brandsQuery.isLoading,
              label: t('brand'),
              loadingLabel: t('loading'),
            }}
            options={toVehicleCatalogOptions(brandsQuery.data?.items)}
            value={state.brand}
            onChange={handleBrandChange}
          />
        )}
        {mode === VEHICLE_CATALOG_FIELD_MODE.TEXT ? (
          <FleetField label={t('model')} value={state.model} onChange={handleModelChange} />
        ) : (
          <CatalogSelectField
            field={{
              disabled: isBlocked || state.brand === '',
              hint: undefined,
              isLoading: isListing && state.brand !== '' && modelsQuery.isLoading,
              label: t('model'),
              loadingLabel: t('loading'),
            }}
            options={toVehicleCatalogOptions(modelsQuery.data?.items)}
            value={state.model}
            onChange={handleModelChange}
          />
        )}
        <FleetField
          inputMode="numeric"
          label={t('modelYear')}
          maxLength={4}
          value={state.modelYear}
          onChange={(modelYear) => onChange({ modelYear })}
        />
        <FleetField
          inputMode="numeric"
          label={t('axleCount')}
          maxLength={2}
          value={state.axleCount}
          onChange={(axleCount) => onChange({ axleCount })}
        />
        <VehicleColorField value={state.color} onChange={(color) => onChange({ color })} />
        <FleetField
          hint={t('fleetNumberHint')}
          label={t('fleetNumber')}
          optional
          value={state.fleetNumber}
          onChange={(fleetNumber) => onChange({ fleetNumber })}
        />
      </div>
    </fieldset>
  )
}
