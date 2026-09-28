/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { MultiSelect } from '@/components/ui/multi-select'
import { Select } from '@/components/ui/select'
import { useVehicleSelectOptions } from '@/modules/fleet/hooks/useVehicleSelectOptions.hook'
import type { FleetDriverListItem, FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { useTripCrewDialog } from '../hooks/useTripCrewDialog.hook'
import type { TripDetail } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripCrewDialogProps = Readonly<{
  drivers: readonly FleetDriverListItem[]
  isOpen: boolean
  onClose: () => void
  onSubmit: (
    input: Readonly<{ driverIds: readonly string[]; vehicleId: string }>,
  ) => Promise<unknown>
  trip: TripDetail
  vehicles: readonly FleetVehicleDetail[]
}>

/**
 * Spec 217 T310: "tem que ser pela tela" — o pedido do dono do produto. Trocar motorista(s) e
 * veículo de uma viagem, servida só quando `allowed-actions` traz `defineCrew` (D6). A ordem em
 * que os motoristas são marcados vira a ordem da tripulação (`position`, D1).
 */
export function TripCrewDialog({
  drivers,
  isOpen,
  onClose,
  onSubmit,
  trip,
  vehicles,
}: TripCrewDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })
  const dialog = useTripCrewDialog({ isOpen, onSubmit, trip })
  const vehicleOptions = useVehicleSelectOptions(vehicles)

  if (!isOpen) return null

  async function handleSubmit(): Promise<void> {
    const succeeded = await dialog.submit()
    if (succeeded) onClose()
  }

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="trip-crew-dialog-title"
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <div>
            <h2 id="trip-crew-dialog-title">{t('crewDialog.title')}</h2>
            <p className={styles.mdfeGateSubtitle}>{t('crewDialog.subtitle')}</p>
          </div>
          <button
            aria-label={t('mdfeGate.close')}
            className={styles.iconAction}
            onClick={onClose}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <div className={styles.fieldGrid}>
          <label>
            {t('crewDialog.drivers')}
            {drivers.length === 0 ? (
              <p className={styles.hint}>{t('crewDialog.driversEmpty')}</p>
            ) : (
              <MultiSelect
                ariaLabel={t('crewDialog.drivers')}
                clearAllLabel={t('crewDialog.driversClearAll')}
                emptyLabel={t('crewDialog.driversNoMatch')}
                onChange={dialog.setDriverIds}
                options={drivers.map((driver) => ({ label: driver.name, value: driver.id }))}
                placeholder={t('crewDialog.driversPlaceholder')}
                removeLabel={t('crewDialog.driversRemove')}
                searchPlaceholder={t('crewDialog.driversSearch')}
                summaryLabel={(count) => t('crewDialog.driversSummary', { count })}
                values={dialog.driverIds}
              />
            )}
          </label>

          <label>
            {t('crewDialog.vehicle')}
            <Select
              ariaLabel={t('crewDialog.vehicle')}
              clearable
              onChange={dialog.setVehicleId}
              options={vehicleOptions}
              placeholder={t('crewDialog.vehiclePlaceholder')}
              searchPlaceholder={t('crewDialog.vehicleSearch')}
              value={dialog.vehicleId}
            />
          </label>
        </div>

        {dialog.errorKey === undefined ? null : (
          <p className={styles.alert} role="alert">
            {t(`crewDialog.error.${dialog.errorKey}`)}
          </p>
        )}

        <footer className={styles.mdfeGateFooter}>
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('mdfeGate.close')}
          </Button>
          <Button
            disabled={dialog.isSubmitting}
            onClick={() => void handleSubmit()}
            size="sm"
            type="button"
          >
            <Icon name="save" />
            {t('crewDialog.submit')}
          </Button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
