/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { MultiSelect } from '@/components/ui/multi-select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useVehicleSelectOptions } from '@/modules/fleet/hooks/useVehicleSelectOptions.hook'
import { resolveVehicleColorSwatch } from '@/modules/fleet/shared/vehicleOption.service'
import { VEHICLE_TYPE_ICONS } from '@/modules/shared/vehicleTypeIcon.service'
import type { FleetDriverDetail, FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'

import type { TripRouteAssemblyController } from '../hooks/useTripRouteAssembly.hook'
import {
  resolveRouteAssemblyFailure,
  type RouteAssemblyFailure,
} from '../shared/routeAssemblyFailure.service'
import { TripDocumentSearch } from './TripDocumentSearch.component'
import {
  buildDriverSelectOption,
  describeBoundVehicle,
} from '../shared/driverBoundVehicles.service'
import styles from '../styles/trip.module.css'

type TripRouteAssemblyPanelProps = Readonly<{
  assembly: TripRouteAssemblyController
  drivers: readonly FleetDriverDetail[]
  vehicles: readonly FleetVehicleDetail[]
}>

export function TripRouteAssemblyPanel({
  assembly,
  drivers,
  vehicles,
}: TripRouteAssemblyPanelProps) {
  const { t } = useTranslation('trip')
  /**
   * A cor sai do vocabulário da frota, não do `trip`: copiar as chaves faria "Branca" ter duas
   * grafias no mesmo produto — a mesma razão pela qual `useVehicleSelectOptions` faz assim.
   */
  const { t: tFleet } = useTranslation('fleet')
  /**
   * O vocabulário de recusa do roteirizador é do módulo dele: as cinco recusas de `409` e a queda
   * da matriz de estrada já têm texto lá, e copiá-los daria duas grafias para a mesma falha.
   */
  const { t: tRouting } = useTranslation('routing')
  const activeDrivers = drivers.filter((driver) => driver.status === 'active')
  const tractionVehicles = vehicles.filter(
    (vehicle) => vehicle.status === 'active' && vehicle.role === 'traction',
  )
  const vehicleOptions = useVehicleSelectOptions(tractionVehicles)
  const vehicleById = new Map(
    vehicles.map((vehicle) => [
      vehicle.id,
      {
        /** Implemento tem `vehicleType` vazio — o tipo é de quem traciona, então ali não há ícone. */
        ...(vehicle.vehicleType === '' ? {} : { icon: VEHICLE_TYPE_ICONS[vehicle.vehicleType] }),
        description: describeBoundVehicle({
          brand: vehicle.brand,
          colorLabel:
            resolveVehicleColorSwatch(vehicle.color) === undefined
              ? ''
              : tFleet(`colorOption.${vehicle.color}`),
          model: vehicle.model,
          modelYear: vehicle.modelYear,
        }),
        plate: vehicle.plate,
      },
    ]),
  )
  const bindingByDriverId = new Map(assembly.bindings.map((binding) => [binding.driverId, binding]))
  const driverIds = activeDrivers.map((driver) => driver.id)
  const vehicleIds = tractionVehicles.map((vehicle) => vehicle.id)
  const allDriversSelected =
    driverIds.length > 0 && driverIds.every((id) => assembly.draft.driverIds.includes(id))
  /**
   * O veículo que veio com o motorista conta como escolhido: ele já está na viagem, e pedir que o
   * botão o marque de novo faria "todos" nunca ficar completo com um agregado na lista.
   */
  const allVehiclesSelected =
    vehicleIds.length > 0 && vehicleIds.every((id) => assembly.effectiveVehicleIds.includes(id))

  function toggleAllDrivers(): void {
    assembly.setDriverIds(allDriversSelected ? [] : driverIds)
  }

  function toggleAllVehicles(): void {
    assembly.setVehicleIds(allVehiclesSelected ? [] : vehicleIds)
  }

  const { alreadyOnTrip, eligible } = assembly.selection
  const isBlocked = assembly.issues.length > 0 || assembly.assembleMutation.isPending
  const failure = assembly.assembleMutation.isError
    ? resolveRouteAssemblyFailure(assembly.assembleMutation.error)
    : null

  /**
   * O texto vem do módulo dono da recusa. Código sem texto próprio **não vira silêncio**: sai a
   * frase genérica com o código ao lado, que é o que permite pedir suporte com informação.
   */
  function describeFailure(reason: RouteAssemblyFailure): string {
    if (reason.namespace === 'routing') return tRouting(reason.key)
    if (reason.namespace === 'trip') return t(reason.key)
    return t('routeAssembly.failure.unknown', { code: reason.code })
  }

  if (assembly.documentsQuery.isLoading) {
    return (
      <SkeletonGroup className={styles.panel} label={t('routeAssembly.loadingDocuments')}>
        <Skeleton variant="text" width="14rem" />
        <div className={styles.fieldGrid}>
          <Skeleton height="var(--field-height)" width="100%" />
          <Skeleton height="var(--field-height)" width="100%" />
          <Skeleton height="var(--field-height)" width="100%" />
        </div>
      </SkeletonGroup>
    )
  }

  return (
    <section className={styles.assemblyBody}>
      <TripDocumentSearch
        documents={assembly.availableDocuments}
        onSelectionChange={assembly.setPool}
      />

      <p className={styles.hint}>
        {t('routeAssembly.selection', { count: eligible.length })}
        {alreadyOnTrip.length > 0
          ? ` ${t('routeAssembly.alreadyOnTrip', { count: alreadyOnTrip.length })}`
          : ''}
      </p>

      <div className={styles.fieldGrid}>
        <label>
          <span className={styles.fieldHead}>
            {t('routeAssembly.drivers')}
            {/*
              A viagem com a frota inteira é o caso do dia cheio, e escolher trinta motoristas um a
              um no multi-select é o trabalho que o botão poupa. Ele alterna, porque quem marcou
              todos por engano precisa de um clique para desfazer, não de trinta.
            */}
            {activeDrivers.length === 0 ? null : (
              <Button onClick={toggleAllDrivers} size="sm" type="button" variant="ghost">
                <Icon name={allDriversSelected ? 'remove' : 'check'} />
                {t(allDriversSelected ? 'routeAssembly.clearDrivers' : 'routeAssembly.allDrivers', {
                  count: activeDrivers.length,
                })}
              </Button>
            )}
          </span>
          <MultiSelect
            ariaLabel={t('routeAssembly.drivers')}
            clearAllLabel={t('creation.driversClearAll')}
            emptyLabel={t('creation.driversNoMatch')}
            onChange={assembly.setDriverIds}
            options={activeDrivers.map((driver) =>
              buildDriverSelectOption({
                binding: bindingByDriverId.get(driver.id),
                driver,
                vehicleById,
              }),
            )}
            placeholder={t('creation.driversPlaceholder')}
            removeLabel={t('creation.driversRemove')}
            searchPlaceholder={t('creation.driversSearch')}
            summaryLabel={(count) => t('creation.driversSummary', { count })}
            values={assembly.draft.driverIds}
          />
        </label>

        <label>
          <span className={styles.fieldHead}>
            {t('routeAssembly.vehicles')}
            {tractionVehicles.length === 0 ? null : (
              <Button onClick={toggleAllVehicles} size="sm" type="button" variant="ghost">
                <Icon name={allVehiclesSelected ? 'remove' : 'check'} />
                {t(
                  allVehiclesSelected ? 'routeAssembly.clearVehicles' : 'routeAssembly.allVehicles',
                  { count: tractionVehicles.length },
                )}
              </Button>
            )}
          </span>
          <MultiSelect
            ariaLabel={t('routeAssembly.vehicles')}
            clearAllLabel={t('routeAssembly.vehiclesClearAll')}
            emptyLabel={t('routeAssembly.vehiclesNoMatch')}
            onChange={assembly.setVehicleIds}
            options={vehicleOptions}
            placeholder={t('routeAssembly.vehiclesPlaceholder')}
            removeLabel={t('routeAssembly.vehiclesRemove')}
            searchPlaceholder={t('routeAssembly.vehiclesSearch')}
            summaryLabel={(count) => t('routeAssembly.vehiclesSummary', { count })}
            values={assembly.effectiveVehicleIds}
          />
        </label>
      </div>

      {assembly.boundVehicleIds.length > 0 ? (
        <p className={styles.hint}>
          {t('routeAssembly.boundByDriver', { count: assembly.boundVehicleIds.length })}
        </p>
      ) : null}

      {assembly.issues.map((issue) => (
        <p className={styles.alert} key={issue}>
          {t(`routeAssembly.issue.${issue}`)}
        </p>
      ))}

      <div className={styles.actionActions}>
        <Button
          disabled={isBlocked}
          onClick={() => assembly.assembleMutation.mutate()}
          size="sm"
          type="button"
        >
          <Icon name="workspace-trip" />
          {t('routeAssembly.submit')}
        </Button>
      </div>

      {assembly.assembleMutation.isPending ? (
        <SkeletonGroup className={styles.assemblyPending} label={t('routeAssembly.pending')}>
          {assembly.effectiveVehicleIds.map((vehicleId) => (
            <div className={styles.assemblyPendingCard} key={vehicleId}>
              <Skeleton variant="text" width="9rem" />
              <Skeleton variant="text" width="6rem" />
              <Skeleton variant="text" width="12rem" />
              <Skeleton variant="text" width="10rem" />
            </div>
          ))}
        </SkeletonGroup>
      ) : null}
      {failure === null ? null : (
        <p className={styles.alert} role="alert">
          {describeFailure(failure)}
        </p>
      )}
    </section>
  )
}
