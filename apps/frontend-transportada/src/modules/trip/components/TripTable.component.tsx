/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Tooltip } from '@/components/ui/tooltip'

import { formatVehiclePlate } from '@/modules/fleet/shared/vehiclePlateFormat.service'
import { resolveVehicleColorSwatch } from '@/modules/fleet/shared/vehicleOption.service'
import type { FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'

import { toDisplayPersonName } from '@/modules/shared/personName.service'

import { describeBoundVehicle } from '../shared/driverBoundVehicles.service'
import type { TripTableController } from '../hooks/useTripTable.hook'
import type { Trip, TripStatus } from '../shared/trip.types'
import { TRIP_COLUMN_KEYS, type TripColumnKey } from '../shared/tripTable.service'
import styles from '../styles/trip.module.css'

type TripTableProps = Readonly<{
  /**
   * A frota já carregada pela página. A listagem de viagens serve `vehicleId`, e um UUID de 36
   * caracteres não diz nada a quem procura o caminhão — a placa e a ficha dizem.
   */
  vehicles: readonly FleetVehicleDetail[]
  table: TripTableController
}>

function statusClassName(status: TripStatus): string {
  return status === 'completed' || status === 'cancelled'
    ? `${styles.statusBadge} ${styles.statusReady}`
    : `${styles.statusBadge}`
}

function formatMoment(value: string): string {
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? value : moment.toLocaleString()
}

export function TripTable({ table, vehicles }: TripTableProps) {
  const { t } = useTranslation('trip')
  const { t: tFleet } = useTranslation('fleet')
  const vehicleById = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]))

  function renderCell(trip: Trip, column: TripColumnKey) {
    if (column === 'status') {
      return <span className={statusClassName(trip.status)}>{t(`status.${trip.status}`)}</span>
    }
    if (column === 'vehicleId') return renderVehicle(trip)
    if (column === 'createdAt') return formatMoment(trip.createdAt)
    if (column === 'updatedAt') return formatMoment(trip.updatedAt)
    return trip[column]
  }

  /**
   * ⚠️ Veículo que a frota ainda não carregou (ou que saiu dela) continua imprimindo **alguma
   * coisa** — a placa não existe aqui, então sobra o identificador. Sumir com a célula esconderia
   * que a viagem tem veículo, que é pior que mostrar um código.
   */
  function renderVehicle(trip: Trip) {
    const vehicle = vehicleById.get(trip.vehicleId)
    const drivers =
      trip.driverNames.length === 0 ? (
        <span className={styles.vehicleSpec}>{t('table.withoutDriver')}</span>
      ) : (
        <span className={styles.vehicleDrivers}>
          {trip.driverNames.map(toDisplayPersonName).join(' · ')}
        </span>
      )

    if (vehicle === undefined) {
      return (
        <div className={styles.vehicleCell}>
          {drivers}
          <span className={styles.vehicleLine}>
            <span className={styles.vehiclePlate}>{trip.vehicleId}</span>
          </span>
        </div>
      )
    }

    const description = describeBoundVehicle({
      brand: vehicle.brand,
      /** Cor fora do catálogo não vira rótulo: o swatch ausente é o sinal, como no select. */
      colorLabel:
        resolveVehicleColorSwatch(vehicle.color) === undefined
          ? ''
          : tFleet(`colorOption.${vehicle.color}`),
      model: vehicle.model,
      modelYear: vehicle.modelYear,
    })
    return (
      <div className={styles.vehicleCell}>
        {drivers}
        <span className={styles.vehicleLine}>
          <span className={styles.vehiclePlate}>{formatVehiclePlate(vehicle.plate)}</span>
          {description === '' ? null : <span className={styles.vehicleSpec}>{description}</span>}
        </span>
      </div>
    )
  }

  /**
   * O que identifica a linha para quem lê é a **placa**, não o UUID da viagem. Veículo que a frota
   * não carregou cai no identificador — o mesmo critério da célula, para o tooltip e a coluna não
   * nomearem a viagem de jeitos diferentes.
   */
  function vehicleLabel(trip: Trip): string {
    const plate = vehicleById.get(trip.vehicleId)?.plate
    return plate === undefined ? trip.vehicleId : formatVehiclePlate(plate)
  }

  function sortIndicator(column: TripColumnKey): string {
    if (table.sort === null || table.sort.column !== column) return ''
    return table.sort.direction === 'asc' ? '▲' : '▼'
  }

  function sortLabel(column: TripColumnKey): string {
    if (table.sort === null || table.sort.column !== column) return t('sort.none')
    return table.sort.direction === 'asc' ? t('sort.asc') : t('sort.desc')
  }

  return (
    <section className={styles.panel} aria-labelledby="trip-table-title">
      <div className={styles.panelHead}>
        <h2 id="trip-table-title">{t('tripsTitle')}</h2>
        <p className={styles.counter}>{t('resultCounter', { shown: table.visibleItems.length })}</p>
      </div>

      <div className={styles.tableScroll}>
        <table className={styles.dataTable}>
          <thead>
            <tr>
              {TRIP_COLUMN_KEYS.map((column) => (
                <th key={column} scope="col">
                  <button
                    className={styles.sortButton}
                    onClick={() => table.toggleSort(column)}
                    type="button"
                  >
                    {t(`columns.${column}`)}
                    <span className={styles.sortIndicator} aria-hidden="true">
                      {sortIndicator(column)}
                    </span>
                    <span className={styles.srOnly}>{sortLabel(column)}</span>
                  </button>
                </th>
              ))}
              <th scope="col">{t('actions.title')}</th>
            </tr>
          </thead>
          <tbody>
            {table.visibleItems.map((trip) => (
              <tr key={trip.id}>
                {TRIP_COLUMN_KEYS.map((column) => (
                  <td key={column}>{renderCell(trip, column)}</td>
                ))}
                <td>
                  {/* "Ver" não diz ver o quê: a dica nomeia a viagem que o clique abre. */}
                  <Tooltip label={t('actions.viewTrip', { vehicle: vehicleLabel(trip) })}>
                    <Button
                      aria-label={t('actions.viewTrip', { vehicle: vehicleLabel(trip) })}
                      onClick={() => table.openTrip(trip.id)}
                      size="sm"
                      type="button"
                      variant="secondary"
                    >
                      <Icon name="eye" />
                      {t('actions.view')}
                    </Button>
                  </Tooltip>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {table.visibleItems.length === 0 ? <p className={styles.hint}>{t('empty')}</p> : null}

      <div className={styles.toolbar}>
        <Button
          aria-label={t('pagination.previous')}
          disabled={!table.canGoToPreviousPage}
          onClick={table.goToPreviousPage}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Icon name="page-previous" />
          {t('pagination.previous')}
        </Button>
        <Button
          aria-label={t('pagination.next')}
          disabled={!table.hasNextPage}
          onClick={table.goToNextPage}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t('pagination.next')}
          <Icon name="page-next" />
        </Button>
      </div>
    </section>
  )
}
