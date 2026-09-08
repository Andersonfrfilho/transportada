import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import type { TollBoothChargeEntry } from '@/modules/company-settings/shared/companySettingsClient.service'
import {
  formatFuelPricePerUnit,
  toFuelPricePerUnit,
} from '@/modules/company-settings/shared/fuelPrice.service'

import { FleetDateField } from './FleetField.component'
import type { TollBoothChargeAdjustment } from '../hooks/useTollBoothCharges.hook'
import styles from '../styles/fleet.module.css'

export type TollBoothChargePanelProps = Readonly<{
  charges: readonly TollBoothChargeEntry[] | undefined
  disabled: boolean
  errorCode?: string
  loading: boolean
  onAdjust: (input: TollBoothChargeAdjustment) => void
  onClear: (osmNodeId: number) => void
  saved: boolean
}>

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function useDayFormatter(): (value: string) => string {
  const { i18n } = useTranslation('fleet')
  const formatter = new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'pt-BR', {
    dateStyle: 'short',
    timeZone: 'UTC',
  })
  return (value) => formatter.format(new Date(`${value}T00:00:00.000Z`))
}

function formatChargeOrUnknown(value: string | null, unknownLabel: string): string {
  return value === null ? unknownLabel : formatFuelPricePerUnit(value)
}

/** Skeleton de três linhas: forma plausível de praça enquanto a leitura não chega. */
function TollBoothChargeSkeleton() {
  const { t } = useTranslation('fleet')
  return (
    <SkeletonGroup label={t('tollBoothCharges.title')}>
      {[0, 1, 2].map((index) => (
        <Skeleton key={`toll-booth-charge-skeleton-${index}`} height="6rem" width="100%" />
      ))}
    </SkeletonGroup>
  )
}

function TollBoothChargeRow(
  props: Readonly<{
    disabled: boolean
    entry: TollBoothChargeEntry
    onAdjust: (input: TollBoothChargeAdjustment) => void
    onClear: (osmNodeId: number) => void
  }>,
) {
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
        <p className={styles.fuelPriceProduct}>{entry.name ?? t('tollBoothCharges.unnamed')}</p>
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
        <label>
          {t('tollBoothCharges.manualFieldLabel')}
          <input
            aria-invalid={manualInvalid}
            disabled={props.disabled}
            type="text"
            value={manualDraft}
            onChange={(event) => setManualDraft(event.target.value)}
          />
        </label>
        <label>
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

export function TollBoothChargePanel(props: TollBoothChargePanelProps) {
  const { t } = useTranslation('fleet')
  return (
    <section className={styles.panel} aria-labelledby="toll-booth-charges-title">
      <h2 id="toll-booth-charges-title">{t('tollBoothCharges.title')}</h2>
      <p className={styles.hint}>{t('tollBoothCharges.hint')}</p>
      {props.loading ? (
        <TollBoothChargeSkeleton />
      ) : props.charges === undefined ? (
        <p className={styles.fuelPriceStatusError} role="alert">
          {t('tollBoothCharges.loadError')}
        </p>
      ) : props.charges.length === 0 ? (
        <p className={styles.fieldHint}>{t('tollBoothCharges.empty')}</p>
      ) : (
        <div className={styles.fuelPriceList}>
          {props.charges.map((entry) => (
            <TollBoothChargeRow
              key={`toll-booth-charge-${entry.osmNodeId}`}
              disabled={props.disabled}
              entry={entry}
              onAdjust={props.onAdjust}
              onClear={props.onClear}
            />
          ))}
        </div>
      )}
      {props.saved && (
        <p className={styles.fuelPriceStatusSuccess} role="status">
          {t('tollBoothCharges.saved')}
        </p>
      )}
      {props.errorCode !== undefined && (
        <p className={styles.fuelPriceStatusError} role="alert">
          {t('tollBoothCharges.error', { code: props.errorCode })}
        </p>
      )}
    </section>
  )
}
