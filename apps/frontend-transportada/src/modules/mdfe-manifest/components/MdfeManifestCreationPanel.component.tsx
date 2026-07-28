/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import type { FleetDriverDetail, FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'

import type { MdfeManifestCreationController } from '../hooks/useMdfeManifestCreation.hook'
import {
  MDFE_CARGO_TYPE,
  MDFE_CARGO_UNIT,
  MDFE_EMITTER_TYPE,
  MDFE_TRANSPORTER_TYPE,
  type MdfeCargoType,
  type MdfeCargoUnit,
  type MdfeEmitterType,
  type MdfeTransporterType,
} from '../shared/mdfeManifest.types'
import type { MdfeManifestDraft } from '../shared/mdfeManifestActions.service'
import { validateManifestForm } from '../shared/mdfeManifestForm.service'
import styles from '../styles/mdfeManifest.module.css'
import { MdfeManifestLotacaoFields } from './MdfeManifestLotacaoFields.component'

type MdfeManifestCreationPanelProps = Readonly<{
  creation: MdfeManifestCreationController
  drivers: readonly FleetDriverDetail[]
  isCreatePending: boolean
  isPreviewPending: boolean
  isReadOnly: boolean
  onCreate: () => void
  onPreview: () => void
  preview: MdfeManifestDraft | null
  vehicles: readonly FleetVehicleDetail[]
}>

export function MdfeManifestCreationPanel({
  creation,
  drivers,
  isCreatePending,
  isPreviewPending,
  isReadOnly,
  onCreate,
  onPreview,
  preview,
  vehicles,
}: MdfeManifestCreationPanelProps) {
  const { t } = useTranslation('mdfeManifest')
  const issues = validateManifestForm({ documentIds: creation.documentIds, draft: creation.draft })
  const activeDrivers = drivers.filter((driver) => driver.status === 'active')
  const tractionVehicles = vehicles.filter(
    (vehicle) => vehicle.status === 'active' && vehicle.role === 'traction',
  )

  if (isReadOnly) {
    return (
      <section className={styles.panel} aria-labelledby="mdfe-manifest-creation-title">
        <h2 id="mdfe-manifest-creation-title">{t('creation.title')}</h2>
        <p className={styles.hint}>{t('creation.readOnly')}</p>
      </section>
    )
  }

  return (
    <section className={styles.panel} aria-labelledby="mdfe-manifest-creation-title">
      <div className={styles.panelHead}>
        <h2 id="mdfe-manifest-creation-title">{t('creation.title')}</h2>
        <Button onClick={creation.reset} size="sm" type="button" variant="ghost">
          {t('actions.resetCreation')}
        </Button>
      </div>

      <div className={styles.fieldGrid}>
        <label>
          {t('creation.batch')}
          <select
            onChange={(event) =>
              creation.selectBatch(event.target.value.length === 0 ? null : event.target.value)
            }
            value={creation.selectedBatchId ?? ''}
          >
            <option value="">{t('creation.batchPlaceholder')}</option>
            {creation.batches.map((batch) => (
              <option key={batch.id} value={batch.id}>
                {batch.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {creation.isLoadingBatches ? (
        <p className={styles.hint}>{t('creation.loadingBatches')}</p>
      ) : null}
      {creation.isLoadingCandidates ? (
        <p className={styles.hint}>{t('creation.loadingCandidates')}</p>
      ) : null}

      <fieldset className={styles.candidateList}>
        <legend className={styles.hint}>{t('creation.candidates')}</legend>
        {creation.candidates.map((candidate) => (
          <label className={styles.candidateRow} key={candidate.fiscalDocumentId}>
            <input
              aria-label={`${t('creation.selectCandidate')} ${candidate.accessKey}`}
              checked={creation.documentIds.includes(candidate.fiscalDocumentId)}
              onChange={() => creation.toggleCandidate(candidate.fiscalDocumentId)}
              type="checkbox"
            />
            <span>
              {candidate.fiscalSeries ?? ''} {candidate.fiscalNumber ?? ''}
            </span>
            <span className={styles.candidateKey}>{candidate.accessKey}</span>
            <span>{candidate.totalAmount}</span>
          </label>
        ))}
        {creation.candidates.length === 0 && !creation.isLoadingCandidates ? (
          <p className={styles.hint}>{t('creation.candidatesEmpty')}</p>
        ) : null}
      </fieldset>

      <p className={styles.summaryLine}>
        {t('creation.selectedSummary', { count: creation.documentIds.length })}
      </p>

      <div className={styles.fieldGrid}>
        <label>
          {t('creation.vehicle')}
          <select
            onChange={(event) => creation.setDraftField('vehicleId', event.target.value)}
            value={creation.draft.vehicleId}
          >
            <option value="">{t('creation.vehiclePlaceholder')}</option>
            {tractionVehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.plate} · {vehicle.state}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('creation.destinationState')}
          <input
            maxLength={2}
            onChange={(event) =>
              creation.setDraftField('destinationState', event.target.value.toUpperCase())
            }
            value={creation.draft.destinationState}
          />
        </label>
        <label>
          {t('creation.cargoProduct')}
          <input
            onChange={(event) => creation.setDraftField('cargoProduct', event.target.value)}
            value={creation.draft.cargoProduct}
          />
        </label>
        <label>
          {t('creation.cargoProductNcm')}
          <input
            onChange={(event) => creation.setDraftField('cargoProductNcm', event.target.value)}
            value={creation.draft.cargoProductNcm}
          />
        </label>
        <label>
          {t('creation.cargoType')}
          <select
            onChange={(event) =>
              creation.setDraftField('cargoType', event.target.value as '' | MdfeCargoType)
            }
            value={creation.draft.cargoType}
          >
            <option value="" />
            {MDFE_CARGO_TYPE.map((cargoType) => (
              <option key={cargoType} value={cargoType}>
                {t(`cargoType.${cargoType}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('creation.cargoUnit')}
          <select
            onChange={(event) =>
              creation.setDraftField('cargoUnit', event.target.value as MdfeCargoUnit)
            }
            value={creation.draft.cargoUnit}
          >
            {MDFE_CARGO_UNIT.map((cargoUnit) => (
              <option key={cargoUnit} value={cargoUnit}>
                {t(`cargoUnit.${cargoUnit}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('creation.emitterType')}
          <select
            onChange={(event) =>
              creation.setDraftField('emitterType', event.target.value as MdfeEmitterType)
            }
            value={creation.draft.emitterType}
          >
            {MDFE_EMITTER_TYPE.map((emitterType) => (
              <option key={emitterType} value={emitterType}>
                {t(`emitterType.${emitterType}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('creation.transporterType')}
          <select
            onChange={(event) =>
              creation.setDraftField(
                'transporterType',
                event.target.value as '' | MdfeTransporterType,
              )
            }
            value={creation.draft.transporterType}
          >
            <option value="">{t('transporterType.none')}</option>
            {MDFE_TRANSPORTER_TYPE.map((transporterType) => (
              <option key={transporterType} value={transporterType}>
                {t(`transporterType.${transporterType}`)}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t('creation.tripStartedAt')}
          <input
            onChange={(event) => creation.setDraftField('tripStartedAt', event.target.value)}
            type="datetime-local"
            value={creation.draft.tripStartedAt}
          />
        </label>
        <label>
          {t('creation.additionalInformation')}
          <input
            onChange={(event) =>
              creation.setDraftField('additionalInformation', event.target.value)
            }
            value={creation.draft.additionalInformation}
          />
        </label>
      </div>

      <MdfeManifestLotacaoFields draft={creation.draft} onChange={creation.setDraftField} />

      <fieldset className={styles.driverChecklist}>
        <legend className={styles.hint}>{t('creation.drivers')}</legend>
        {activeDrivers.map((driver) => (
          <label key={driver.id}>
            <input
              checked={creation.draft.driverIds.includes(driver.id)}
              onChange={() => creation.toggleDriverSelection(driver.id)}
              type="checkbox"
            />
            {driver.name}
          </label>
        ))}
        {activeDrivers.length === 0 ? (
          <p className={styles.hint}>{t('creation.driversEmpty')}</p>
        ) : null}
      </fieldset>

      {issues.map((issue) => (
        <p className={styles.alert} key={issue}>
          {t(`formIssue.${issue}`)}
        </p>
      ))}

      {preview === null ? null : (
        <div className={styles.actionForm}>
          <h3>{t('creation.previewTitle')}</h3>
          <p className={styles.summaryLine}>
            {t('creation.previewSummary', {
              count: preview.totals.cteCount,
              value: preview.totals.cargoValue,
              weight: preview.totals.cargoWeight,
            })}
          </p>
          <p className={styles.summaryLine}>
            {t('creation.previewLoading', { cities: preview.loadingCityNames.join(', ') })}
          </p>
          <p className={styles.summaryLine}>
            {t('creation.previewDischarge', { cities: preview.dischargeCityNames.join(', ') })}
          </p>
          {preview.blocked.length > 0 ? (
            <p className={styles.alert}>
              {t('creation.previewBlocked', { count: preview.blocked.length })}
            </p>
          ) : null}
        </div>
      )}

      <div className={styles.actionActions}>
        <Button
          disabled={creation.documentIds.length === 0 || isPreviewPending}
          onClick={onPreview}
          size="sm"
          type="button"
          variant="secondary"
        >
          {t('actions.preview')}
        </Button>
        <Button
          disabled={issues.length > 0 || isCreatePending}
          onClick={onCreate}
          size="sm"
          type="button"
        >
          {t('actions.create')}
        </Button>
      </div>
      {isCreatePending ? <p className={styles.hint}>{t('creation.pending')}</p> : null}
    </section>
  )
}
