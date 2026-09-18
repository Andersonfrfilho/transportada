/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Uma praça do catálogo (spec 154 T204): valor efetivo e origem por campo, tarifa do mapa e o
 * formulário de ajuste — inalterado desde a spec 095, só com a marca de `catalogKnown: false` (D1).
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { toFuelPricePerUnit } from '@/modules/company-settings/shared/fuelPrice.service'

import { FleetDateField } from './FleetField.component'
import { useDayFormatter } from '../hooks/useDayFormatter.hook'
import type { TollBoothChargeAdjustment } from '../hooks/useTollBoothCharges.hook'
import { formatChargeOrUnknown, todayIsoDate } from '../shared/tollBoothChargeFormat.service'
import type { TollBoothCatalogEntry } from '../shared/tollBoothCatalog.validation'
import styles from '../styles/fleet.module.css'

/** Skeleton de três linhas: forma plausível de praça enquanto a leitura não chega. */
export function TollBoothChargeSkeleton() {
  const { t } = useTranslation('fleet')
  return (
    <SkeletonGroup label={t('tollBoothCharges.title')}>
      {[0, 1, 2].map((index) => (
        <Skeleton key={`toll-booth-charge-skeleton-${index}`} height="6rem" width="100%" />
      ))}
    </SkeletonGroup>
  )
}

export type TollBoothChargeRowProps = Readonly<{
  disabled: boolean
  entry: TollBoothCatalogEntry
  onAdjust: (input: TollBoothChargeAdjustment) => void
  onClear: (osmNodeId: number) => void
}>

export function TollBoothChargeRow(props: TollBoothChargeRowProps) {
  const { t } = useTranslation('fleet')
  const formatDay = useDayFormatter()
  const { entry } = props
  const [manualDraft, setManualDraft] = useState('')
  const [automaticDraft, setAutomaticDraft] = useState('')
  const [observedOnDraft, setObservedOnDraft] = useState(todayIsoDate())
  const unknownLabel = t('tollBoothCharges.unknown')

  const manualPrice = manualDraft === '' ? undefined : toFuelPricePerUnit(manualDraft)
  const automaticPrice = automaticDraft === '' ? undefined : toFuelPricePerUnit(automaticDraft)
  const manualInvalid = manualDraft !== '' && manualPrice === null
  const automaticInvalid = automaticDraft !== '' && automaticPrice === null
  const hasSomethingToSave =
    (manualPrice !== undefined && manualPrice !== null) ||
    (automaticPrice !== undefined && automaticPrice !== null)
  const canSave = hasSomethingToSave && !manualInvalid && !automaticInvalid

  function handleAdjust() {
    if (!canSave) return
    props.onAdjust({
      ...(manualPrice == null ? {} : { chargePerAxle: manualPrice }),
      ...(automaticPrice == null ? {} : { chargePerAxleAutomatic: automaticPrice }),
      observedOn: observedOnDraft,
      osmNodeId: entry.osmNodeId,
    })
    setManualDraft('')
    setAutomaticDraft('')
  }

  return (
    <div className={styles.fuelPriceRow}>
      <div className={styles.fuelPriceFacts}>
        <p className={styles.fuelPriceProduct}>
          {entry.name ?? t('tollBoothCharges.unnamed')}
          {/* Spec 154 D1: o ajuste sobrevive à praça sumir do catálogo — marcada, nunca escondida. */}
          {entry.catalogKnown ? null : (
            <Badge className={styles.incompleteBadge} variant="secondary">
              {t('tollBoothCharges.catalog.unknownCatalog')}
            </Badge>
          )}
        </p>
        <p className={styles.fieldHint}>
          {entry.operator === null
            ? t('tollBoothCharges.operatorUnknown')
            : t('tollBoothCharges.operator', { operator: entry.operator })}
        </p>
        <p className={styles.fuelPriceEffective}>
          {t('tollBoothCharges.effectiveManual', {
            price: formatChargeOrUnknown(entry.effectiveChargePerAxle, unknownLabel),
            source: t(`tollBoothCharges.source.${entry.chargePerAxleSource}`),
          })}
        </p>
        <p className={styles.fuelPriceEffective}>
          {t('tollBoothCharges.effectiveAutomatic', {
            price: formatChargeOrUnknown(entry.effectiveChargePerAxleAutomatic, unknownLabel),
            source: t(`tollBoothCharges.source.${entry.chargePerAxleAutomaticSource}`),
          })}
        </p>
        <p className={styles.fieldHint}>
          {t('tollBoothCharges.mapTariff', {
            automatic: formatChargeOrUnknown(entry.catalog.chargePerAxleAutomatic, unknownLabel),
            date: formatDay(entry.catalog.observedOn),
            manual: formatChargeOrUnknown(entry.catalog.chargePerAxle, unknownLabel),
          })}
        </p>
        {entry.source === 'manual' && (
          <p className={styles.fieldHint}>
            {t('tollBoothCharges.adjustedBy', { date: formatDay(entry.observedOn) })}
          </p>
        )}
      </div>
      <div className={styles.fuelPriceForm}>
        <label className={styles.tollBoothField}>
          {t('tollBoothCharges.manualFieldLabel')}
          <input
            aria-invalid={manualInvalid}
            disabled={props.disabled}
            type="text"
            value={manualDraft}
            onChange={(event) => setManualDraft(event.target.value)}
          />
        </label>
        <label className={styles.tollBoothField}>
          {t('tollBoothCharges.automaticFieldLabel')}
          <input
            aria-invalid={automaticInvalid}
            disabled={props.disabled}
            type="text"
            value={automaticDraft}
            onChange={(event) => setAutomaticDraft(event.target.value)}
          />
        </label>
        <FleetDateField
          label={t('tollBoothCharges.observedOnFieldLabel')}
          value={observedOnDraft}
          onChange={setObservedOnDraft}
        />
        <div className={styles.fuelPriceActions}>
          <button
            className={styles.primaryAction}
            disabled={props.disabled || !canSave}
            type="button"
            onClick={handleAdjust}
          >
            <Icon name="save" />
            {t('tollBoothCharges.save')}
          </button>
          {entry.source === 'manual' && (
            <button
              className={styles.secondaryAction}
              disabled={props.disabled}
              type="button"
              onClick={() => props.onClear(entry.osmNodeId)}
            >
              <Icon name="refresh" />
              {t('tollBoothCharges.clear')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
