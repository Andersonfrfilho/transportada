/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
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
import { isManifestFromTrip, validateManifestForm } from '../shared/mdfeManifestForm.service'
import styles from '../styles/mdfeManifest.module.css'
import { MdfeManifestLotacaoFields } from './MdfeManifestLotacaoFields.component'

const MDFE_CANDIDATE_SKELETON_ROW_COUNT = 4

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
  const formInput = {
    documentIds: creation.documentIds,
    draft: creation.draft,
    tripId: creation.originTripId,
  }
  const issues = validateManifestForm(formInput)
  const fromTrip = isManifestFromTrip(formInput)
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
          <Icon name="refresh" />
          {t('actions.resetCreation')}
        </Button>
      </div>

      {fromTrip ? <p className={styles.hint}>{t('creation.fromTrip')}</p> : null}

      {creation.isLoadingBatches ? (
        <SkeletonGroup className={styles.fieldGrid} label={t('creation.loadingBatches')}>
          <div className={styles.skeletonField}>
            <Skeleton variant="text" width="40%" />
            <Skeleton height="var(--field-height)" width="100%" />
          </div>
        </SkeletonGroup>
      ) : (
        <div className={styles.fieldGrid}>
          <label>
            {t('creation.batch')}
            <Select
              ariaLabel={t('creation.batch')}
              clearable
              options={creation.batches.map((batch) => ({ label: batch.name, value: batch.id }))}
              placeholder={t('creation.batchPlaceholder')}
              value={creation.selectedBatchId ?? ''}
              onChange={(value) => creation.selectBatch(value.length === 0 ? null : value)}
            />
          </label>
        </div>
      )}

      {creation.isLoadingCandidates ? (
        <SkeletonGroup className={styles.candidateList} label={t('creation.loadingCandidates')}>
          {Array.from({ length: MDFE_CANDIDATE_SKELETON_ROW_COUNT }, (_, index) => (
            <div className={styles.candidateRow} key={index}>
              <Skeleton height="var(--space-4)" variant="block" width="var(--space-4)" />
              <Skeleton variant="text" width="20%" />
              <Skeleton variant="text" width="45%" />
              <Skeleton variant="text" width="15%" />
            </div>
          ))}
        </SkeletonGroup>
      ) : (
        <fieldset className={styles.candidateList}>
          <legend className={styles.hint}>{t('creation.candidates')}</legend>
          {creation.candidates.map((candidate) => (
            <label className={styles.candidateRow} key={candidate.fiscalDocumentId}>
              <Checkbox
                ariaLabel={`${t('creation.selectCandidate')} ${candidate.accessKey}`}
                checked={creation.documentIds.includes(candidate.fiscalDocumentId)}
                onChange={() => creation.toggleCandidate(candidate.fiscalDocumentId)}
              />
              <span>
                {candidate.fiscalSeries ?? ''} {candidate.fiscalNumber ?? ''}
              </span>
              <span className={styles.candidateKey}>{candidate.accessKey}</span>
              <span>{candidate.totalAmount}</span>
            </label>
          ))}
          {creation.candidates.length === 0 ? (
            <p className={styles.hint}>{t('creation.candidatesEmpty')}</p>
          ) : null}
        </fieldset>
      )}

      <p className={styles.summaryLine}>
        {t('creation.selectedSummary', { count: creation.documentIds.length })}
      </p>

      <div className={styles.fieldGrid}>
        {fromTrip ? null : (
          <label>
            {t('creation.vehicle')}
            <Select
              ariaLabel={t('creation.vehicle')}
              clearable
              options={tractionVehicles.map((vehicle) => ({
                label: `${vehicle.plate} · ${vehicle.state}`,
                value: vehicle.id,
              }))}
              placeholder={t('creation.vehiclePlaceholder')}
              value={creation.draft.vehicleId}
              onChange={(value) => creation.setDraftField('vehicleId', value)}
            />
          </label>
        )}
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
          <Select
            ariaLabel={t('creation.cargoType')}
            clearable
            options={MDFE_CARGO_TYPE.map((cargoType) => ({
              label: t(`cargoType.${cargoType}`),
              value: cargoType,
            }))}
            placeholder={t('filters.all')}
            value={creation.draft.cargoType}
            onChange={(value) => creation.setDraftField('cargoType', value as '' | MdfeCargoType)}
          />
        </label>
        <label>
          {t('creation.cargoUnit')}
          <Select
            ariaLabel={t('creation.cargoUnit')}
            options={MDFE_CARGO_UNIT.map((cargoUnit) => ({
              label: t(`cargoUnit.${cargoUnit}`),
              value: cargoUnit,
            }))}
            value={creation.draft.cargoUnit}
            onChange={(value) => creation.setDraftField('cargoUnit', value as MdfeCargoUnit)}
          />
        </label>
        <label>
          {t('creation.emitterType')}
          <Select
            ariaLabel={t('creation.emitterType')}
            options={MDFE_EMITTER_TYPE.map((emitterType) => ({
              label: t(`emitterType.${emitterType}`),
              value: emitterType,
            }))}
            value={creation.draft.emitterType}
            onChange={(value) => creation.setDraftField('emitterType', value as MdfeEmitterType)}
          />
        </label>
        <label>
          {t('creation.transporterType')}
          <Select
            ariaLabel={t('creation.transporterType')}
            clearable
            options={MDFE_TRANSPORTER_TYPE.map((transporterType) => ({
              label: t(`transporterType.${transporterType}`),
              value: transporterType,
            }))}
            placeholder={t('transporterType.none')}
            value={creation.draft.transporterType}
            onChange={(value) =>
              creation.setDraftField('transporterType', value as '' | MdfeTransporterType)
            }
          />
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

      {fromTrip ? null : (
        <fieldset className={styles.driverChecklist}>
          <legend className={styles.hint}>{t('creation.drivers')}</legend>
          {activeDrivers.map((driver) => (
            <Checkbox
              checked={creation.draft.driverIds.includes(driver.id)}
              key={driver.id}
              label={driver.name}
              onChange={() => creation.toggleDriverSelection(driver.id)}
            />
          ))}
          {activeDrivers.length === 0 ? (
            <p className={styles.hint}>{t('creation.driversEmpty')}</p>
          ) : null}
        </fieldset>
      )}

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
          <Icon name="search" />
          {t('actions.preview')}
        </Button>
        <Button
          disabled={issues.length > 0 || isCreatePending}
          onClick={onCreate}
          size="sm"
          type="button"
        >
          <Icon name="add" />
          {t('actions.create')}
        </Button>
      </div>
      {isCreatePending ? <p className={styles.hint}>{t('creation.pending')}</p> : null}
    </section>
  )
}
