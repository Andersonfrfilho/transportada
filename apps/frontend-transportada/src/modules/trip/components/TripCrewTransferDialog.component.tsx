/* Copyright (c) 2026 Ada Technology. MIT License. */
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { MultiSelect } from '@/components/ui/multi-select'
import type { FleetDriverListItem } from '@/modules/fleet/shared/fleet.types'
import { useModalDialog } from '@/modules/shared/useModalDialog.hook'

import { useTripCrewTransferDialog } from '../hooks/useTripCrewTransferDialog.hook'
import type { TripDetail } from '../shared/trip.types'
import { CREW_TRANSFER_REASON_MAX_LENGTH } from '../shared/tripCrewTransfer.service'
import type { CrewTransferResult } from '../shared/tripCrewTransfer.types'
import styles from '../styles/trip.module.css'
import { CrewTransferMemberList } from './CrewTransferMemberList.component'
import { TripCrewTransferOutcome } from './TripCrewTransferOutcome.component'

type TripCrewTransferDialogProps = Readonly<{
  drivers: readonly FleetDriverListItem[]
  isOpen: boolean
  onClose: () => void
  onSubmit: (
    input: Readonly<{
      driverIds: readonly string[]
      helperIds: readonly string[]
      reason: string
    }>,
  ) => Promise<CrewTransferResult>
  trip: TripDetail
}>

/**
 * Spec 249 T2.2: a viagem que já saiu troca de motorista(s) e ajudante(s). Servido só quando
 * `allowed-actions` traz `transferCrew` e a pessoa tem `trip.report-on-behalf`. Sem veículo: o
 * caminhão fica travado (D2) e a troca recalcula só o custo da tripulação.
 */
export function TripCrewTransferDialog({
  drivers,
  isOpen,
  onClose,
  onSubmit,
  trip,
}: TripCrewTransferDialogProps) {
  const { t } = useTranslation('trip')
  const { dialogRef, handleKeyDown } = useModalDialog({ isOpen, onClose })
  const dialog = useTripCrewTransferDialog({ drivers, isOpen, onSubmit, trip })

  if (!isOpen) return null

  return createPortal(
    <div className={styles.mdfeGateOverlay} onKeyDown={handleKeyDown} role="presentation">
      <div
        aria-labelledby="trip-crew-transfer-dialog-title"
        aria-modal="true"
        className={styles.mdfeGateDialog}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className={styles.mdfeGateHeader}>
          <div>
            <h2 id="trip-crew-transfer-dialog-title">{t('crewTransferDialog.title')}</h2>
            <p className={styles.mdfeGateSubtitle}>{t('crewTransferDialog.subtitle')}</p>
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

        {dialog.outcome === undefined ? (
          <div className={`${styles.fieldGrid} ${styles.crewTransferForm}`}>
            <section>
              <p className={styles.hint}>{t('crewTransferDialog.current')}</p>
              <CrewTransferMemberList members={dialog.currentMembers} />
            </section>

            <label>
              {t('crewTransferDialog.drivers')}
              {dialog.driverCandidates.length === 0 ? (
                <p className={styles.hint}>{t('crewTransferDialog.driversEmpty')}</p>
              ) : (
                <MultiSelect
                  ariaLabel={t('crewTransferDialog.drivers')}
                  clearAllLabel={t('crewTransferDialog.clearAll')}
                  emptyLabel={t('crewTransferDialog.driversNoMatch')}
                  onChange={dialog.setDriverIds}
                  options={dialog.driverCandidates.map((driver) => ({
                    label: driver.name,
                    value: driver.id,
                  }))}
                  placeholder={t('crewTransferDialog.driversPlaceholder')}
                  removeLabel={t('crewTransferDialog.driversRemove')}
                  searchPlaceholder={t('crewTransferDialog.search')}
                  summaryLabel={(count) => t('crewTransferDialog.driversSummary', { count })}
                  values={dialog.driverIds}
                />
              )}
            </label>

            <label>
              {t('crewTransferDialog.helpers')}
              {dialog.helperCandidates.length === 0 ? (
                <p className={styles.hint}>{t('crewTransferDialog.helpersEmpty')}</p>
              ) : (
                <MultiSelect
                  ariaLabel={t('crewTransferDialog.helpers')}
                  clearAllLabel={t('crewTransferDialog.clearAll')}
                  emptyLabel={t('crewTransferDialog.helpersNoMatch')}
                  onChange={dialog.setHelperIds}
                  options={dialog.helperCandidates.map((driver) => ({
                    label: driver.name,
                    value: driver.id,
                  }))}
                  placeholder={t('crewTransferDialog.helpersPlaceholder')}
                  removeLabel={t('crewTransferDialog.helpersRemove')}
                  searchPlaceholder={t('crewTransferDialog.search')}
                  summaryLabel={(count) => t('crewTransferDialog.helpersSummary', { count })}
                  values={dialog.helperIds}
                />
              )}
            </label>

            <label>
              {t('crewTransferDialog.reason')}
              <textarea
                autoComplete="off"
                maxLength={CREW_TRANSFER_REASON_MAX_LENGTH}
                onChange={(event) => dialog.setReason(event.target.value)}
                value={dialog.reason}
              />
            </label>

            <section className={styles.crewTransferSummary}>
              <p className={styles.hint}>{t('crewTransferDialog.summary.title')}</p>
              {dialog.hasChanges ? (
                <>
                  <div className={styles.crewTransferLeaving}>
                    <strong>{t('crewTransferDialog.summary.leaving')}</strong>
                    <CrewTransferMemberList members={dialog.summary.leaving} />
                  </div>
                  <div className={styles.crewTransferEntering}>
                    <strong>{t('crewTransferDialog.summary.entering')}</strong>
                    <CrewTransferMemberList members={dialog.summary.entering} />
                  </div>
                </>
              ) : (
                <p className={styles.hint}>{t('crewTransferDialog.summary.none')}</p>
              )}
            </section>

            <p className={styles.hint}>{t('crewTransferDialog.vehicleLocked')}</p>

            {dialog.hasChanges && dialog.blocker !== undefined ? (
              <p className={styles.hint}>{t(`crewTransferDialog.blocker.${dialog.blocker}`)}</p>
            ) : null}
          </div>
        ) : (
          <TripCrewTransferOutcome outcome={dialog.outcome} />
        )}

        {dialog.errorKey === undefined ? null : (
          <p className={styles.alert} role="alert">
            {t(`crewTransferDialog.error.${dialog.errorKey}`)}
          </p>
        )}

        <footer className={styles.mdfeGateFooter}>
          <Button onClick={onClose} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('mdfeGate.close')}
          </Button>
          {dialog.outcome === undefined ? (
            <Button
              disabled={!dialog.canSubmit}
              onClick={() => void dialog.submit()}
              size="sm"
              type="button"
            >
              <Icon name="truck" />
              {t('crewTransferDialog.submit')}
            </Button>
          ) : null}
        </footer>
      </div>
    </div>,
    document.body,
  )
}
