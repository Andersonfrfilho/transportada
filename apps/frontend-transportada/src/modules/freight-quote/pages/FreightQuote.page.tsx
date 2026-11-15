/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import { useAuthMeQuery } from '@/modules/identity/queries/useAuthMe.query'

import { useCalculateFreightQuote, useFreightQuoteSettings } from '../hooks/useFreightQuote.hook'
import {
  FREIGHT_QUOTE_PERMISSION,
  FREIGHT_QUOTE_SETTINGS_PERMISSION,
  type FreightQuoteResult,
  type FreightQuoteSettings,
} from '../shared/freightQuote.types'
import {
  EMPTY_QUOTE_DRAFT,
  buildQuoteSubmission,
  buildSettingsSubmission,
  formatAmount,
  formatDecimalField,
  startSettingsDraft,
  type AddressDraft,
  type NumericSettingKey,
  type QuoteDraft,
  type SettingsDraft,
} from '../shared/freightQuoteForm.service'
import styles from '../styles/freightQuote.module.css'

/** A norma não tem coluna de 8 eixos: a conta usa o vizinho (Art. 5 §5), e a tela avisa. */
const AXLE_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9] as const

const SETTING_FIELDS: readonly Readonly<{
  key: NumericSettingKey
  unit: 'km' | 'percent' | 'perKm'
}>[] = [
  { key: 'marginPercent', unit: 'percent' },
  { key: 'expectedOccupancyPercent', unit: 'percent' },
  { key: 'driverCostPerKm', unit: 'perKm' },
  { key: 'maintenanceCostPerKm', unit: 'perKm' },
  { key: 'tiresCostPerKm', unit: 'perKm' },
  { key: 'fixedCostPerKm', unit: 'perKm' },
  { key: 'adValoremPercent', unit: 'percent' },
  { key: 'grisPercent', unit: 'percent' },
  { key: 'fuelKmPerLiter', unit: 'km' },
]

/** `0.3529` da API vira `35` para a frase "35% da viagem"; só exibição. */
function formatPercentOfTrip(factor: string): string {
  return String(Math.round(Number.parseFloat(factor) * 100))
}

/** Data civil `2026-07-17` para `17/07/2026`, sem passar por `Date` (que deslocaria o dia pelo fuso). */
function formatIsoDate(value: string): string {
  const [year = '', month = '', day = ''] = value.split('-')
  return `${day}/${month}/${year}`
}

function errorMessage(error: unknown, t: TFunction<'freightQuote'>): string | null {
  if (!(error instanceof Error)) return null
  return t(`errors.${error.message}`, { defaultValue: t('errors.REQUEST_FAILED') })
}

function QuoteResultPanel({ result }: Readonly<{ result: FreightQuoteResult }>) {
  const { t } = useTranslation('freightQuote')
  const floor = result.anttFloor
  return (
    <section aria-label={t('result.title')} className={styles.result}>
      <div className={styles.panelHead}>
        <h3>{t('result.title')}</h3>
        <Badge variant={result.settingsOrigin === 'company' ? 'success' : 'secondary'}>
          {t(`origin.${result.settingsOrigin}`)}
        </Badge>
      </div>
      <dl className={styles.lines}>
        {result.lines.map((line) => (
          <div key={line.key}>
            <dt>{t(`lines.${line.key}`)}</dt>
            <dd>{formatAmount(line.amount)}</dd>
          </div>
        ))}
        <div className={styles.lineTotal}>
          <dt>{t('result.tripCost')}</dt>
          <dd>{formatAmount(result.tripCostAmount)}</dd>
        </div>
        <div>
          <dt>
            {t('result.shipmentCost', { share: formatPercentOfTrip(result.costShareFactor) })}
          </dt>
          <dd>{formatAmount(result.shipmentCostAmount)}</dd>
        </div>
        <div>
          <dt>{t('result.margin')}</dt>
          <dd>{formatAmount(result.marginAmount)}</dd>
        </div>
        {floor === null ? null : (
          <div>
            <dt>{t('result.anttFloor', { table: floor.table })}</dt>
            <dd>{formatAmount(floor.floorAmount)}</dd>
          </div>
        )}
        <div className={styles.lineTotal}>
          <dt>{t('result.freight')}</dt>
          <dd>{formatAmount(result.freightAmount)}</dd>
        </div>
        <div>
          <dt>{t('result.adValorem')}</dt>
          <dd>{formatAmount(result.adValoremAmount)}</dd>
        </div>
        <div>
          <dt>{t('result.gris')}</dt>
          <dd>{formatAmount(result.grisAmount)}</dd>
        </div>
        <div className={styles.grandTotal}>
          <dt>{t('result.total')}</dt>
          <dd>{formatAmount(result.totalAmount)}</dd>
        </div>
      </dl>
      {floor?.applied === true ? (
        <p className={styles.warning} role="status">
          {t('result.floorApplied')}
        </p>
      ) : null}
      {floor !== null ? (
        <p className={styles.hint}>
          {t('result.floorFormula', {
            ccd: formatDecimalField(floor.ccd),
            cc: formatDecimalField(floor.cc),
            axles: floor.axlesUsed,
          })}
        </p>
      ) : null}
      <p className={styles.hint}>
        {t('result.road', {
          distance: formatDecimalField(result.distanceKm),
          toll: formatAmount(result.tollAmount),
        })}
      </p>
      <p className={styles.hint}>
        {t('result.fuel', {
          consumption: formatDecimalField(result.fuelKmPerLiter),
          origin: t(`fuelOrigin.${result.fuelKmPerLiterOrigin}`),
          price: formatAmount(result.fuelPricePerLitre),
        })}
      </p>
    </section>
  )
}

const ADDRESS_FIELDS = ['postalCode', 'street', 'number', 'district', 'city', 'state'] as const

function AddressFields(
  props: Readonly<{ legend: string; onChange: (value: AddressDraft) => void; value: AddressDraft }>,
) {
  const { t } = useTranslation('freightQuote')
  return (
    <fieldset className={styles.addressGroup}>
      <legend>{props.legend}</legend>
      {ADDRESS_FIELDS.map((key) => (
        <label className={styles.field} key={key}>
          <span>{t(`quote.address.${key}`)}</span>
          <input
            autoComplete="off"
            inputMode={key === 'postalCode' ? 'numeric' : undefined}
            maxLength={key === 'state' ? 2 : undefined}
            onChange={(event) => props.onChange({ ...props.value, [key]: event.target.value })}
            value={props.value[key]}
          />
        </label>
      ))}
    </fieldset>
  )
}

function QuotePanel({ settings }: Readonly<{ settings: FreightQuoteSettings | undefined }>) {
  const { t } = useTranslation('freightQuote')
  const calculate = useCalculateFreightQuote()
  const [draft, setDraft] = useState<QuoteDraft>(EMPTY_QUOTE_DRAFT)
  const submission = buildQuoteSubmission(draft)
  const patch = (changes: Partial<QuoteDraft>) =>
    setDraft((current) => ({ ...current, ...changes }))
  const cargoTypes = settings?.anttFloor.cargoTypes ?? []
  const error = errorMessage(calculate.error, t)

  return (
    <section aria-labelledby="freight-quote-title" className={styles.panel}>
      <div className={styles.panelHead}>
        <h2 id="freight-quote-title">{t('quote.title')}</h2>
      </div>
      <p className={styles.hint}>{t('quote.hint')}</p>
      <div className={styles.form}>
        <AddressFields
          legend={t('quote.origin')}
          onChange={(origin) => patch({ origin })}
          value={draft.origin}
        />
        <AddressFields
          legend={t('quote.destination')}
          onChange={(destination) => patch({ destination })}
          value={draft.destination}
        />
        <div className={styles.field}>
          <span>{t('quote.axles')}</span>
          <Select
            ariaLabel={t('quote.axles')}
            onChange={(value) => patch({ axles: value })}
            options={AXLE_OPTIONS.map((axles) => ({
              label: t('quote.axlesOption', { count: axles }),
              value: String(axles),
            }))}
            value={draft.axles}
          />
        </div>
        <div className={styles.field}>
          <span>{t('quote.cargoType')}</span>
          <Select
            ariaLabel={t('quote.cargoType')}
            onChange={(value) => patch({ cargoType: value })}
            options={cargoTypes.map((type) => ({ label: type.label, value: String(type.code) }))}
            value={draft.cargoType}
          />
        </div>
        <label className={styles.field}>
          <span>{t('quote.cargoValue')}</span>
          <input
            inputMode="decimal"
            onChange={(event) => patch({ cargoValue: event.target.value })}
            placeholder="0"
            value={draft.cargoValue}
          />
        </label>
        <label className={styles.field}>
          <span>{t('quote.share')}</span>
          <input
            inputMode="decimal"
            onChange={(event) => patch({ shareOfVehiclePercent: event.target.value })}
            value={draft.shareOfVehiclePercent}
          />
        </label>
        <label className={styles.field}>
          <span>{t('quote.fuelPrice')}</span>
          <input
            inputMode="decimal"
            onChange={(event) => patch({ fuelPricePerLitre: event.target.value })}
            placeholder={t('quote.fuelPricePlaceholder')}
            value={draft.fuelPricePerLitre}
          />
        </label>
        <div className={styles.fieldCheck}>
          <Checkbox
            checked={draft.highPerformance}
            label={t('quote.highPerformance')}
            onChange={(checked) => patch({ highPerformance: checked })}
          />
        </div>
      </div>
      {draft.axles === '8' ? <p className={styles.hint}>{t('quote.eightAxles')}</p> : null}
      <div className={styles.actions}>
        <Button
          disabled={submission === null || calculate.isPending}
          onClick={() => {
            if (submission !== null) calculate.mutate(submission)
          }}
          type="button"
        >
          <Icon name="refresh" />
          {calculate.isPending ? t('quote.calculating') : t('quote.calculate')}
        </Button>
      </div>
      {error === null ? null : (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      {calculate.data === undefined ? null : <QuoteResultPanel result={calculate.data} />}
    </section>
  )
}

function SettingsForm(props: Readonly<{ canEdit: boolean; settings: FreightQuoteSettings }>) {
  const { t } = useTranslation('freightQuote')
  const { clear, save } = useFreightQuoteSettings({ enabled: false })
  const [draft, setDraft] = useState<SettingsDraft>(() => startSettingsDraft(props.settings.values))
  const [saved, setSaved] = useState(false)
  const submission = buildSettingsSubmission(draft)
  const error = errorMessage(save.error ?? clear.error, t)
  const source = props.settings.anttFloor.source

  function edit(changes: Partial<SettingsDraft>) {
    setSaved(false)
    setDraft((current) => ({ ...current, ...changes }))
  }

  return (
    <>
      <div className={styles.form}>
        {SETTING_FIELDS.map((field) => (
          <label className={styles.field} key={field.key}>
            <span>{t(`settings.fields.${field.key}`)}</span>
            <input
              disabled={!props.canEdit}
              inputMode="decimal"
              onChange={(event) => edit({ [field.key]: event.target.value })}
              placeholder={
                field.key === 'fuelKmPerLiter' ? t('settings.fuelKmPerLiterPlaceholder') : undefined
              }
              value={draft[field.key]}
            />
            <small className={styles.hint}>
              {t(`settings.why.${field.key}`, {
                value: formatDecimalField(props.settings.defaults[field.key]),
              })}
            </small>
          </label>
        ))}
        <div className={styles.fieldCheck}>
          <Checkbox
            checked={draft.applyAnttFloor}
            disabled={!props.canEdit}
            label={t('settings.applyAnttFloor')}
            onChange={(checked) => edit({ applyAnttFloor: checked })}
          />
        </div>
      </div>
      <p className={styles.hint}>
        {t('settings.anttSource', {
          resolution: source.resolution,
          date: formatIsoDate(source.effectiveFrom),
        })}{' '}
        <a href={source.url} rel="noreferrer" target="_blank">
          {t('settings.anttLink')}
        </a>
      </p>
      {props.canEdit ? (
        <div className={styles.actions}>
          <Button
            disabled={submission === null || save.isPending}
            onClick={() => {
              if (submission === null) return
              save.mutate(submission, { onSuccess: () => setSaved(true) })
            }}
            type="button"
          >
            <Icon name="save" />
            {t('settings.save')}
          </Button>
          {props.settings.origin === 'company' ? (
            <Button
              disabled={clear.isPending}
              onClick={() => clear.mutate(undefined, { onSuccess: () => setSaved(true) })}
              type="button"
              variant="secondary"
            >
              <Icon name="refresh" />
              {t('settings.clear')}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className={styles.hint}>{t('settings.readOnly')}</p>
      )}
      {saved ? (
        <p className={styles.status} role="status">
          {t('settings.saved')}
        </p>
      ) : null}
      {error === null ? null : (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </>
  )
}

export function FreightQuotePage() {
  const { t } = useTranslation('freightQuote')
  const permissions = useAuthMeQuery().data?.data.permissions ?? []
  const canQuote = permissions.includes(FREIGHT_QUOTE_PERMISSION)
  const canEdit = permissions.includes(FREIGHT_QUOTE_SETTINGS_PERMISSION)
  const { query } = useFreightQuoteSettings({ enabled: canQuote })
  const settings = query.data

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <p className={styles.hint}>{t('subtitle')}</p>
      </header>
      {query.error === null ? null : (
        <p className={styles.error} role="alert">
          {errorMessage(query.error, t)}
        </p>
      )}
      <QuotePanel settings={settings} />
      <section aria-labelledby="freight-quote-settings-title" className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 id="freight-quote-settings-title">{t('settings.title')}</h2>
          {settings === undefined ? null : (
            <Badge variant={settings.origin === 'company' ? 'success' : 'secondary'}>
              {t(`origin.${settings.origin}`)}
            </Badge>
          )}
        </div>
        <p className={styles.hint}>{t('settings.hint')}</p>
        {settings === undefined ? (
          <SkeletonGroup label={t('settings.title')}>
            <Skeleton height="var(--field-height)" width="100%" />
            <Skeleton height="var(--field-height)" width="100%" />
          </SkeletonGroup>
        ) : (
          <SettingsForm
            canEdit={canEdit}
            key={settings.updatedAt ?? 'default'}
            settings={settings}
          />
        )}
      </section>
    </main>
  )
}
