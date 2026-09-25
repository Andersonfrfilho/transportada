/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'

import type { DriverTrip } from '../shared/driverTrip.types'
import styles from '../styles/driverTrip.module.css'

type DriverTripSelectorProps = Readonly<{
  onSelect: (tripId: string) => void
  selectedTripId: string | undefined
  trips: readonly DriverTrip[]
}>

/**
 * RF12 (ADR-0075 §8): o agregado com duas viagens ativas vê as duas. Com uma só não há o que
 * escolher, e o seletor não aparece. A ordem é a da API (`createdAt` ascendente), e o número da
 * viagem é essa posição — duas viagens podem ter a mesma placa.
 */
export function DriverTripSelector({ onSelect, selectedTripId, trips }: DriverTripSelectorProps) {
  const { t } = useTranslation('driverTrip')

  if (trips.length < 2) return null

  return (
    <div aria-label={t('tripSelector.label')} className={styles.tripSelector} role="group">
      {trips.map((trip, index) => (
        <Button
          aria-pressed={trip.id === selectedTripId}
          key={trip.id}
          type="button"
          variant={trip.id === selectedTripId ? 'default' : 'secondary'}
          onClick={() => onSelect(trip.id)}
        >
          {t('tripSelector.option', { number: index + 1, plate: trip.vehiclePlate })}
        </Button>
      ))}
    </div>
  )
}
