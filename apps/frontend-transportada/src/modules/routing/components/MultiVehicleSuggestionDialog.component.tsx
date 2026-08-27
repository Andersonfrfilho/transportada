/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import type { MultiVehicleSuggestionController } from '../hooks/useMultiVehicleSuggestion.hook'
import {
  countProposedTrips,
  groupStopsByVehicle,
  UNASSIGNED_GROUP,
} from '../shared/multiVehicleSuggestion.service'
import styles from '../styles/routing.module.css'

type MultiVehicleSuggestionDialogProps = Readonly<{
  dialog: MultiVehicleSuggestionController
  documentCount: number
  onOpenTrip: (tripId: string) => void
  vehicleOptions: readonly MultiSelectOption[]
  vehicleLabels: Readonly<Record<string, string>>
}>

/**
 * Spec 058 P2: a tela da distribuição. Ela mostra **uma coluna por veículo**, porque é essa a
 * decisão que a multi-veículo toma — quem leva o quê —, e termina num botão que diz **quantas
 * viagens** o aceite vai criar. Aceitar aqui cria viagem de verdade; um botão que não avisa quantas
 * transforma isso em surpresa.
 */
export function MultiVehicleSuggestionDialog({
  dialog,
  documentCount,
  onOpenTrip,
  vehicleLabels,
  vehicleOptions,
}: MultiVehicleSuggestionDialogProps): JSX.Element | null {
  const { t } = useTranslation('routing')
  const { dialogRef, handleKeyDown } = useModalDialog({
    isOpen: dialog.isOpen,
    onClose: dialog.close,
  })

  if (!dialog.isOpen) return null

  const groups = dialog.suggestion === null ? [] : groupStopsByVehicle(dialog.suggestion)
  const tripCount = dialog.suggestion === null ? 0 : countProposedTrips(dialog.suggestion)
  const isReady = dialog.suggestion?.status === 'ready'

  return createPortal(
    <div className={styles.multiVehicleOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="multi-vehicle-title"
        aria-modal="true"
        className={styles.multiVehicleDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.multiVehicleHeader}>
          <div>
            <h2 id="multi-vehicle-title">{t('multiVehicle.title')}</h2>
            <p>{t('multiVehicle.documents', { count: documentCount })}</p>
          </div>
          <button
            aria-label={t('multiVehicle.close')}
            onClick={dialog.close}
            title={t('multiVehicle.close')}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        {dialog.errorCode !== null && (
          <p role="alert">
            {t([
              `multiVehicle.failure.${dialog.errorCode}`,
              'multiVehicle.failure.unknown',
            ] as const)}
          </p>
        )}

        {dialog.accepted === null && (
          <div className={styles.multiVehicleForm}>
            <MultiSelect
              ariaLabel={t('multiVehicle.vehicles.label')}
              clearAllLabel={t('multiVehicle.vehicles.clearAll')}
              disabled={dialog.suggestion !== null}
              emptyLabel={t('multiVehicle.vehicles.empty')}
              onChange={dialog.setSelectedVehicleIds}
              options={vehicleOptions}
              placeholder={t('multiVehicle.vehicles.placeholder')}
              removeLabel={t('multiVehicle.vehicles.remove', { label: '' })}
              searchPlaceholder={t('multiVehicle.vehicles.search')}
              summaryLabel={(count) => t('multiVehicle.vehicles.summary', { count })}
              values={dialog.selectedVehicleIds}
            />
            {dialog.suggestion === null && (
              <div className={styles.multiVehicleActions}>
                <Button
                  disabled={!dialog.canRequest || dialog.isRequesting}
                  onClick={() => void dialog.request()}
                >
                  <Icon name="send" />
                  {dialog.isRequesting ? t('multiVehicle.requesting') : t('multiVehicle.request')}
                </Button>
              </div>
            )}
          </div>
        )}

        {dialog.suggestion !== null && dialog.accepted === null && (
          <p role="status">{t(`status.${dialog.suggestion.status}`)}</p>
        )}

        {groups.length > 0 && dialog.accepted === null && (
          <div className={styles.multiVehicleGroups}>
            {groups.map((group) => (
              <section
                className={
                  group.vehicleId === UNASSIGNED_GROUP
                    ? `${styles.multiVehicleGroup} ${styles.multiVehicleGroupUnassigned}`
                    : styles.multiVehicleGroup
                }
                key={group.vehicleId === UNASSIGNED_GROUP ? 'unassigned' : group.vehicleId}
              >
                <h3 className={styles.multiVehicleGroupTitle}>
                  {group.vehicleId === UNASSIGNED_GROUP
                    ? t('multiVehicle.unassigned')
                    : t('multiVehicle.vehicleTitle', {
                        plate: vehicleLabels[group.vehicleId] ?? group.vehicleId,
                      })}
                </h3>
                <p>{t('multiVehicle.stopCount', { count: group.stops.length })}</p>
                <ol className={styles.multiVehicleStops}>
                  {group.stops.map((stop) => (
                    <li key={`${group.vehicleId}-${stop.sequence}`}>{stop.label}</li>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        )}

        {/* Distribuição que não pôs nota em veículo nenhum é resultado, não erro — e dizer isso é o
            que impede o operador de aceitar uma proposta vazia achando que criou viagem. */}
        {isReady && tripCount === 0 && dialog.accepted === null && (
          <p role="alert">{t('multiVehicle.empty')}</p>
        )}

        {isReady && dialog.accepted === null && (
          <div className={styles.multiVehicleActions}>
            <Button
              disabled={dialog.isDeciding}
              onClick={() => void dialog.reject()}
              variant="secondary"
            >
              {t('multiVehicle.reject')}
            </Button>
            <Button
              disabled={dialog.isDeciding || tripCount === 0}
              onClick={() => void dialog.accept()}
            >
              <Icon name="check" />
              {t('multiVehicle.accept', { count: tripCount })}
            </Button>
          </div>
        )}

        {dialog.accepted !== null && (
          <div className={styles.multiVehicleAccepted}>
            <p role="status">
              {t('multiVehicle.accepted', { count: dialog.accepted.trips.length })}
            </p>
            <ul className={styles.multiVehicleStops}>
              {dialog.accepted.trips.map((trip) => (
                <li key={trip.tripId}>
                  {t('multiVehicle.vehicleTitle', {
                    plate: vehicleLabels[trip.vehicleId] ?? trip.vehicleId,
                  })}
                  {' · '}
                  {t('multiVehicle.acceptedTrip', {
                    documents: trip.documentCount,
                    stops: trip.stopCount,
                  })}{' '}
                  <button onClick={() => onOpenTrip(trip.tripId)} type="button">
                    {t('multiVehicle.openTrip')}
                  </button>
                </li>
              ))}
            </ul>
            <div className={styles.multiVehicleActions}>
              <Button onClick={dialog.close} variant="secondary">
                {t('multiVehicle.close')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
