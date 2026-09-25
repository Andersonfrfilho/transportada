/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import { describeTripSelectorPath } from '../shared/driverTripSelection.service'
import type { DriverTrip } from '../shared/driverTrip.types'
import styles from '../styles/driverTrip.module.css'

type DriverTripSelectorProps = Readonly<{
  onSelect: (tripId: string) => void
  selectedTripId: string | undefined
  trips: readonly DriverTrip[]
}>

/**
 * RF12 (ADR-0075 §8): o agregado com duas viagens ativas vê as duas. Com uma só não há o que
 * escolher, e o seletor não aparece. A ordem é a da API (`createdAt` ascendente).
 *
 * O botão diz o **caminho** da viagem (`describeTripSelectorPath`), não a posição na lista: "Viagem
 * 1"/"Viagem 2" não dizia para onde cada uma ia, e duas viagens podem ter a mesma placa — a placa
 * vira linha menor, de apoio, embaixo do trajeto (decisão do usuário, 2026-09-25).
 */
export function DriverTripSelector({ onSelect, selectedTripId, trips }: DriverTripSelectorProps) {
  const { t } = useTranslation('driverTrip')

  if (trips.length < 2) return null

  return (
    <div aria-label={t('tripSelector.label')} className={styles.tripSelector} role="group">
      {trips.map((trip) => {
        const path = describeTripSelectorPath(trip)
        return (
          <Button
            aria-pressed={trip.id === selectedTripId}
            key={trip.id}
            type="button"
            variant={trip.id === selectedTripId ? 'default' : 'secondary'}
            onClick={() => onSelect(trip.id)}
          >
            <span className={styles.tripSelectorOption}>
              <span className={styles.tripSelectorPath}>
                {t('tripSelector.option', { count: path.stopCount, path: path.path })}
              </span>
              <span className={styles.tripSelectorPlate}>{trip.vehiclePlate}</span>
            </span>
          </Button>
        )
      })}
    </div>
  )
}
