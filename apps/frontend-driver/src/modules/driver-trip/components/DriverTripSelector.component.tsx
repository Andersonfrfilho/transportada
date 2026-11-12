/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/ui/copy-button'

import {
  describeTripSelectorPath,
  listTripSelectorCities,
} from '../shared/driverTripSelection.service'
import type { DriverTrip } from '../shared/driverTrip.types'
import { formatShortTripId, formatTripCreatedDate } from '../shared/tripIdentifier.service'
import { isConcludedTripStatus } from '../shared/tripSnapshot.service'
import { formatVehiclePlateText } from '../shared/vehiclePlate.service'
import styles from '../styles/driverTrip.module.css'

import { DriverVehiclePlate } from './DriverVehiclePlate.component'

type DriverTripSelectorProps = Readonly<{
  onSelect: (tripId: string) => void
  selectedTripId: string | undefined
  trips: readonly DriverTrip[]
}>

/**
 * RF12 (ADR-0075 §8): o agregado com duas viagens ativas vê as duas. Com uma só não há o que
 * escolher, e o seletor não aparece. A ordem é a da API (`createdAt` ascendente). Viagem concluída
 * (spec 225) não é opção: a API a devolve por 15 min, mas ela não é mais do motorista.
 *
 * O botão diz o **caminho** da viagem (`describeTripSelectorPath`), não a posição na lista: "Viagem
 * 1"/"Viagem 2" não dizia para onde cada uma ia, e duas viagens podem ter a mesma placa — a placa
 * vira linha menor, de apoio, embaixo do trajeto (decisão do usuário, 2026-09-25).
 */
export function DriverTripSelector({ onSelect, selectedTripId, trips }: DriverTripSelectorProps) {
  const { t } = useTranslation('driverTrip')

  const openTrips = trips.filter((trip) => !isConcludedTripStatus(trip.status))
  if (openTrips.length < 2) return null

  return (
    <div aria-label={t('tripSelector.label')} className={styles.tripSelector} role="group">
      {openTrips.map((trip) => {
        const path = describeTripSelectorPath(trip)
        const cities = listTripSelectorCities(trip)
        const isSelected = trip.id === selectedTripId
        const createdDate = formatTripCreatedDate(trip.createdAt)
        const shortId = formatShortTripId(trip.id)
        return (
          <div className={isSelected ? styles.tripCardSelected : styles.tripCard} key={trip.id}>
            {/*
             * Pedido do usuário (10/11): a identificação separada do trajeto — data e viagem à
             * esquerda, placa à direita, cada uma com o seu copiar. Os copiar são irmãos do botão
             * de escolher (um botão dentro de outro é HTML inválido), por isso o cartão é uma div.
             * O copiar leva o id INTEIRO, como o cabeçalho: o recorte é para ler, não para ditar.
             */}
            <div className={styles.tripCardHead}>
              <div className={styles.tripCardId}>
                <div className={styles.tripCardIdText}>
                  {createdDate === '' ? null : <b>{createdDate}</b>}
                  <span>
                    {t('tripCodeLabel')} <code className={styles.tripCode}>{shortId}</code>
                  </span>
                </div>
                <CopyButton
                  copiedLabel={t('tripCodeCopied')}
                  label={t('tripCodeCopy')}
                  value={trip.id}
                />
              </div>
              <div className={styles.tripCardPlate}>
                <DriverVehiclePlate plate={trip.vehiclePlate} />
                <CopyButton
                  copiedLabel={t('plate.copied')}
                  label={t('plate.copy')}
                  value={formatVehiclePlateText(trip.vehiclePlate)}
                />
              </div>
            </div>
            <button
              aria-pressed={isSelected}
              className={styles.tripCardBody}
              type="button"
              onClick={() => onSelect(trip.id)}
            >
              <span className={styles.tripSelectorPath}>
                {t('tripSelector.option', { count: path.stopCount, path: path.path })}
              </span>
              {cities.length === 0 ? null : (
                <span className={styles.tripCardCities}>{cities.join(' · ')}</span>
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}
