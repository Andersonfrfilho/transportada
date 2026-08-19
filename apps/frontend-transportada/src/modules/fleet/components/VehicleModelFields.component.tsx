/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import type { VehicleCatalogController } from '../hooks/useVehicleCatalog.hook'
import type { FleetVehicleDetail, FleetVehicleFormState } from '../shared/fleet.types'
import {
  applyVehicleBrand,
  hasVehicleCatalogFailure,
  resolveVehicleCatalogCode,
  resolveVehicleCatalogFieldMode,
  VEHICLE_CATALOG_FIELD_MODE,
} from '../shared/fleetForm.service'
import {
  buildVehicleCatalogChoices,
  readRegisteredVehicleBrands,
  readRegisteredVehicleModels,
} from '../shared/vehicleCatalogChoices.service'
import styles from '../styles/fleet.module.css'
import { FleetField } from './FleetField.component'
import { VehicleCatalogField } from './VehicleCatalogField.component'
import { VehicleColorField } from './VehicleColorField.component'

type VehicleModelFieldsProps = Readonly<{
  catalog: VehicleCatalogController
  onChange: (values: Partial<FleetVehicleFormState>) => void
  state: FleetVehicleFormState
  vehicles: readonly FleetVehicleDetail[]
}>

const VEHICLE_CATALOG_BRANDS_QUERY_KEY = 'fleet-vehicle-catalog-brands'
const VEHICLE_CATALOG_MODELS_QUERY_KEY = 'fleet-vehicle-catalog-models'

export function VehicleModelFields({
  catalog,
  onChange,
  state,
  vehicles,
}: VehicleModelFieldsProps) {
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

  /** Provedor fora do ar e reboque não zeram a lista: o que a frota já cadastrou continua lá. */
  const brandChoices = buildVehicleCatalogChoices({
    catalog: brandsQuery.data?.items,
    registered: readRegisteredVehicleBrands(vehicles),
    selected: state.brand,
  })
  const modelChoices = buildVehicleCatalogChoices({
    catalog: modelsQuery.data?.items,
    registered: readRegisteredVehicleModels({ brand: state.brand, vehicles }),
    selected: state.model,
  })

  function resolveBrandHint(): string | undefined {
    if (isBlocked) return t('brandCatalogWheelTypeHint')
    if (mode === VEHICLE_CATALOG_FIELD_MODE.TEXT && hasCatalogFailure) {
      return t('brandCatalogUnavailableHint')
    }
    return undefined
  }

  function handleBrandChange(brand: string): void {
    onChange(applyVehicleBrand(state, brand))
  }

  function handleModelChange(model: string): void {
    onChange({ model })
  }

  const brandHint = resolveBrandHint()

  return (
    <fieldset className={styles.fieldGroup}>
      <legend>{t('vehicleModelLegend')}</legend>
      <div className={styles.fieldGrid}>
        <VehicleCatalogField
          choices={brandChoices}
          disabled={isBlocked}
          isLoading={isListing && brandsQuery.isLoading}
          key={`${state.role}:${state.wheelType}`}
          label={t('brand')}
          value={state.brand}
          {...(brandHint === undefined ? {} : { hint: brandHint })}
          onChange={handleBrandChange}
        />
        <VehicleCatalogField
          choices={modelChoices}
          disabled={isBlocked || state.brand === ''}
          isLoading={isListing && state.brand !== '' && modelsQuery.isLoading}
          key={state.brand}
          label={t('model')}
          value={state.model}
          onChange={handleModelChange}
        />
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
