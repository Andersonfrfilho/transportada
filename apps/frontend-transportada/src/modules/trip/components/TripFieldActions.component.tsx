/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'

import type { FieldActionCapabilities } from '../shared/tripFieldActions.service'
import { hasMultipleDrivers } from '../shared/tripFieldActions.service'
import type { TripDetail } from '../shared/trip.types'
import { TripArrivalDialog } from './TripArrivalDialog.component'
import { TripConfirmDialog } from './TripConfirmDialog.component'
import {
  TripStopOccurrenceDialog,
  type TripStopOccurrenceSubmission,
} from './TripStopOccurrenceDialog.component'
import styles from '../styles/trip.module.css'

export type TripFieldActionsProps = Readonly<{
  canReportOnBehalf: boolean
  capabilities: FieldActionCapabilities
  isArrivePending: boolean
  isConfirmLoadPending: boolean
  isOccurrencePending: boolean
  isStartRoutePending: boolean
  onArrive: (input: { arrivedAt?: string; driverId?: string; stopId: string }) => void
  onConfirmLoad: (input: { driverId?: string }) => void
  onRegisterStopOccurrence: (
    input: TripStopOccurrenceSubmission & { driverId?: string; stopId: string },
  ) => void
  onSelectDriverId: (driverId: string) => void
  onStartRoute: (input: { driverId?: string }) => void
  /**
   * Spec 156 T8b (revisão): estado único do motorista escolhido, levantado para `TripDetail` — as
   * ações de nota (`field-delivery`/`field-return`) e as de viagem (aqui) usam o mesmo seletor, em
   * vez de duas cópias divergentes do mesmo controle.
   */
  selectedDriverId: string
  trip: TripDetail
}>

/**
 * Spec 156 T8: as ações de campo que o escritório aciona pela viagem — conferir carga, iniciar
 * rota, registrar chegada e ocorrência de parada —, todas atrás de `trip.report-on-behalf` e
 * controladas por `allowedActions` (nunca por uma cópia da máquina de estados aqui). As ações de
 * barracão (separar, carregar, despachar) continuam em `TripStateActions` — este painel não decide
 * nada que já era decidido lá.
 */
export function TripFieldActions({
  canReportOnBehalf,
  capabilities,
  isArrivePending,
  isConfirmLoadPending,
  isOccurrencePending,
  isStartRoutePending,
  onArrive,
  onConfirmLoad,
  onRegisterStopOccurrence,
  onSelectDriverId,
  onStartRoute,
  selectedDriverId,
  trip,
}: TripFieldActionsProps) {
  const { t } = useTranslation('trip')
  const [isStartRouteDialogOpen, setIsStartRouteDialogOpen] = useState(false)
  const [occurrenceStopId, setOccurrenceStopId] = useState<null | string>(null)
  /** Spec 156 T15 A1: `arrivedAt` opcional — o diálogo pergunta a hora antes de confirmar. */
  const [arrivalStopId, setArrivalStopId] = useState<null | string>(null)

  if (!canReportOnBehalf) return null

  const driverId = selectedDriverId === '' ? undefined : selectedDriverId
  /** `exactOptionalPropertyTypes` recusa `{ driverId: undefined }` — o espalhamento omite a chave. */
  const driverIdInput = driverId === undefined ? {} : { driverId }
  const canConfirmLoad = capabilities.canTrip('confirmLoad')
  const canStartRoute = capabilities.canTrip('startRoute')
  const hasTripActions = canConfirmLoad || canStartRoute
  const fieldStops = trip.stops.filter(
    (stop) =>
      capabilities.canStop(stop.id, 'arrive') || capabilities.canStop(stop.id, 'occurrence'),
  )
  const occurrenceStop = trip.stops.find((stop) => stop.id === occurrenceStopId)

  if (!hasTripActions && fieldStops.length === 0) return null

  return (
    <div className={styles.actionForm}>
      <h3>{t('fieldActions.title')}</h3>

      {hasMultipleDrivers(trip.drivers) ? (
        <label>
          {t('fieldActions.driverLabel')}
          <Select
            ariaLabel={t('fieldActions.driverLabel')}
            onChange={onSelectDriverId}
            options={trip.drivers.map((driver) => ({
              label: driver.driverName,
              value: driver.driverId,
            }))}
            value={selectedDriverId}
          />
        </label>
      ) : null}

      {hasTripActions ? (
        <div className={styles.actionActions}>
          {canConfirmLoad ? (
            <Button
              disabled={isConfirmLoadPending}
              onClick={() => onConfirmLoad(driverIdInput)}
              size="sm"
              type="button"
            >
              <Icon name="check" />
              {t('fieldActions.confirmLoad')}
            </Button>
          ) : null}
          {canStartRoute ? (
            <Button
              disabled={isStartRoutePending}
              onClick={() => setIsStartRouteDialogOpen(true)}
              size="sm"
              type="button"
            >
              <Icon name="send" />
              {t('fieldActions.startRoute')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {fieldStops.length === 0
        ? null
        : fieldStops.map((stop) => (
            /**
             * `stopCard`/`stopCardHead` são o mesmo primitivo de `TripStopList` (rótulo + ações na
             * mesma linha, com quebra) — `driverChecklist`/`driverLine` é da ficha do motorista
             * (coluna: nome, depois contato) e desalinha rótulo com botão quando há mais de um.
             */
            <div className={styles.stopCard} key={stop.id}>
              <div className={styles.stopCardHead}>
                <span className={styles.stopLabel}>{stop.label}</span>
                {capabilities.canStop(stop.id, 'arrive') ? (
                  <Button
                    disabled={isArrivePending}
                    onClick={() => setArrivalStopId(stop.id)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    <Icon name="check" />
                    {t('fieldActions.arrive')}
                  </Button>
                ) : null}
                {capabilities.canStop(stop.id, 'occurrence') ? (
                  <Button
                    onClick={() => setOccurrenceStopId(stop.id)}
                    size="sm"
                    type="button"
                    variant="ghost"
                  >
                    <Icon name="alert" />
                    {t('fieldActions.occurrence')}
                  </Button>
                ) : null}
              </div>
            </div>
          ))}

      <TripConfirmDialog
        confirmLabel={t('fieldActions.startRouteConfirm')}
        isOpen={isStartRouteDialogOpen}
        isSubmitting={isStartRoutePending}
        message={t('fieldActions.startRouteMessage')}
        onCancel={() => setIsStartRouteDialogOpen(false)}
        onConfirm={() => {
          setIsStartRouteDialogOpen(false)
          onStartRoute(driverIdInput)
        }}
        title={t('fieldActions.startRouteTitle')}
      />

      <TripStopOccurrenceDialog
        isOpen={occurrenceStop !== undefined}
        isSubmitting={isOccurrencePending}
        onClose={() => setOccurrenceStopId(null)}
        onSubmit={(input) => {
          setOccurrenceStopId(null)
          if (occurrenceStop === undefined) return
          onRegisterStopOccurrence({ ...input, ...driverIdInput, stopId: occurrenceStop.id })
        }}
        stopDocuments={occurrenceStop?.documents ?? []}
      />

      {/**
       * Spec 156 T15 A1: `dispatchedAt` ainda é `null` aqui pela mesma razão do assistente de baixa
       * (`GET /trips/:id` não expõe `trip_dispatch_snapshots.dispatched_at`) — pendência já
       * registrada no `evidence.md` da T11, a régua do futuro continua valendo.
       */}
      <TripArrivalDialog
        dispatchedAt={null}
        isOpen={arrivalStopId !== null}
        isSubmitting={isArrivePending}
        onClose={() => setArrivalStopId(null)}
        onSubmit={(arrivedAt) => {
          if (arrivalStopId === null) return
          onArrive({ arrivedAt, ...driverIdInput, stopId: arrivalStopId })
          setArrivalStopId(null)
        }}
      />
    </div>
  )
}
