/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import {
  CNPJ_PATTERN,
  CPF_PATTERN,
  formatTaxId,
  normalizeTaxId,
} from '@/modules/shared/taxId.service'

import {
  DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS,
  DEFAULT_DELIVERY_PROOF_SETTINGS,
  DELIVERY_PROOF_FIELD_MODES,
  DELIVERY_PROOF_FIELDS,
  DELIVERY_PROOF_PUNCTUALITY_FIELDS,
  DELIVERY_PROOF_PUNCTUALITY_RANGES,
  isDeliveryProofPunctualityValue,
  mergeDeliveryProofSettings,
  resolvePunctualityFieldValue,
  type CompanyDeliveryProofSettings,
  type DeliveryProofField,
  type DeliveryProofFieldMode,
  type DeliveryProofFieldSettings,
  type DeliveryProofPunctualityField,
  type DeliveryProofSettingsOverride,
} from '../shared/deliveryProofSettings.service'
import styles from '../styles/trip.module.css'

type TripDeliveryProofSettingsPanelProps = Readonly<{
  canManage: boolean
  /** Spec 156 T14, ADR-0069 §6: `undefined` enquanto carrega — o painel some por trás do skeleton. */
  canhotoOcrEnabled: boolean | undefined
  isSaving: boolean
  isTogglingCanhotoOcr: boolean
  onReplaceOverrides: (overrides: readonly DeliveryProofSettingsOverride[]) => void
  onSaveSettings: (settings: CompanyDeliveryProofSettings) => void
  /**
   * Spec 156 T14, ADR-0069 §6: o `PUT` exige os quatro modos sempre — o painel manda os correntes
   * (`fieldSettings`) junto do interruptor novo, sem tocar nos cinco parâmetros de pontualidade.
   */
  onToggleCanhotoOcr: (fieldSettings: DeliveryProofFieldSettings, nextEnabled: boolean) => void
  overrides: readonly DeliveryProofSettingsOverride[]
  settings: CompanyDeliveryProofSettings | undefined
  showError: boolean
}>

/**
 * Spec 082 (D4, ADR-0057): o painel decide o formulário do comprovante — o app do campo não lê
 * estas rotas, os campos resolvidos viajam no snapshot da viagem.
 *
 * ⚠️ Sem linha gravada a API já resolve a fábrica (documento desligado, o resto oferecido); é ela
 * que aparece, nunca formulário em branco. A exceção por CNPJ vence a geral **por inteiro**.
 */
export function TripDeliveryProofSettingsPanel({
  canManage,
  canhotoOcrEnabled,
  isSaving,
  isTogglingCanhotoOcr,
  onReplaceOverrides,
  onSaveSettings,
  onToggleCanhotoOcr,
  overrides,
  settings,
  showError,
}: TripDeliveryProofSettingsPanelProps) {
  const { t } = useTranslation('trip')
  /** O erro de faixa é anunciado junto do campo pelo leitor de tela (`aria-describedby`). */
  const punctualityErrorIdPrefix = useId()
  const [draft, setDraft] = useState<Partial<DeliveryProofFieldSettings>>({})
  const [overrideTaxId, setOverrideTaxId] = useState('')
  const [overrideDraft, setOverrideDraft] = useState<Partial<DeliveryProofFieldSettings>>({})
  /** RF7: os cinco parâmetros da nota — texto no campo, para deixar dígito parcial sem travar. */
  const [punctualityDraft, setPunctualityDraft] = useState<
    Partial<Record<DeliveryProofPunctualityField, string>>
  >({})

  const general = settings ?? DEFAULT_DELIVERY_PROOF_SETTINGS
  const effective = mergeDeliveryProofSettings({ base: general, override: draft })
  const punctualityGeneral = settings ?? DEFAULT_DELIVERY_PROOF_PUNCTUALITY_SETTINGS

  const modeOptions = DELIVERY_PROOF_FIELD_MODES.map((mode) => ({
    label: t(`deliveryProofSettings.modes.${mode}`),
    value: mode,
  }))

  /** Pelo conjunto, não pelo comprimento: o CNPJ tem letra na base, e onze dígitos podem ser CPF. */
  const isOverrideTaxIdComplete =
    CPF_PATTERN.test(overrideTaxId) || CNPJ_PATTERN.test(overrideTaxId)
  const isOverrideDuplicated = overrides.some((override) => override.taxId === overrideTaxId)

  function punctualityFieldValue(field: DeliveryProofPunctualityField): number {
    return resolvePunctualityFieldValue({
      draftValue: punctualityDraft[field],
      fallback: punctualityGeneral[field],
    })
  }

  const isPunctualityValid = DELIVERY_PROOF_PUNCTUALITY_FIELDS.every((field) =>
    isDeliveryProofPunctualityValue(field, punctualityFieldValue(field)),
  )

  function handleSaveSettings() {
    if (!isPunctualityValid) return
    onSaveSettings({
      ...effective,
      /**
       * Spec 156 T14, ADR-0069 §6: `saveDeliveryProofSettings` nunca manda este campo no corpo — o
       * `PUT` o trata como opcional e "ausente não mexe". Ele só entra aqui para satisfazer o tipo
       * `CompanyDeliveryProofSettings`; quem liga/desliga de verdade é `onToggleCanhotoOcr`.
       */
      canhotoOcrEnabled: canhotoOcrEnabled ?? false,
      latePenaltyPoints: punctualityFieldValue('latePenaltyPoints'),
      missingAfterHours: punctualityFieldValue('missingAfterHours'),
      missingPenaltyPoints: punctualityFieldValue('missingPenaltyPoints'),
      proofRadiusMeters: punctualityFieldValue('proofRadiusMeters'),
      proofWindowMinutes: punctualityFieldValue('proofWindowMinutes'),
    })
  }

  function handleAddOverride() {
    if (!isOverrideTaxIdComplete || isOverrideDuplicated) return
    const override: DeliveryProofSettingsOverride = {
      ...mergeDeliveryProofSettings({ base: general, override: overrideDraft }),
      taxId: overrideTaxId,
    }
    onReplaceOverrides([...overrides, override])
    setOverrideTaxId('')
    setOverrideDraft({})
  }

  function handleRemoveOverride(taxId: string) {
    onReplaceOverrides(overrides.filter((override) => override.taxId !== taxId))
  }

  function renderModeSelect(input: {
    readonly field: DeliveryProofField
    readonly onChange: (field: DeliveryProofField, mode: DeliveryProofFieldMode) => void
    readonly value: DeliveryProofFieldMode
  }) {
    return (
      <label key={input.field}>
        <span className={styles.hint}>{t(`deliveryProofSettings.fields.${input.field}`)}</span>
        <Select
          ariaLabel={t(`deliveryProofSettings.fields.${input.field}`)}
          disabled={!canManage || isSaving}
          onChange={(value) => input.onChange(input.field, value as DeliveryProofFieldMode)}
          options={modeOptions}
          value={input.value}
        />
      </label>
    )
  }

  return (
    <section className={styles.panel}>
      <h3 className={styles.hint}>{t('deliveryProofSettings.title')}</h3>
      <p className={styles.hint}>{t('deliveryProofSettings.hint')}</p>

      {showError ? (
        <p className={styles.alert} role="alert">
          {t('deliveryProofSettings.error')}
        </p>
      ) : null}

      <div className={styles.fieldGrid}>
        {DELIVERY_PROOF_FIELDS.map((field) =>
          renderModeSelect({
            field,
            onChange: (changed, mode) => setDraft((current) => ({ ...current, [changed]: mode })),
            value: effective[field],
          }),
        )}
      </div>

      <h3 className={styles.hint}>{t('deliveryProofSettings.punctuality.title')}</h3>
      <p className={styles.hint}>{t('deliveryProofSettings.punctuality.hint')}</p>
      <div className={styles.fieldGrid}>
        {DELIVERY_PROOF_PUNCTUALITY_FIELDS.map((field) => {
          const range = DELIVERY_PROOF_PUNCTUALITY_RANGES[field]
          const value = punctualityDraft[field] ?? String(punctualityGeneral[field])
          const isInvalid = !isDeliveryProofPunctualityValue(field, punctualityFieldValue(field))
          const errorId = `${punctualityErrorIdPrefix}-${field}`
          return (
            <label key={field}>
              <span className={styles.hint}>{t(`deliveryProofSettings.punctuality.${field}`)}</span>
              <input
                {...(isInvalid ? { 'aria-describedby': errorId } : {})}
                aria-invalid={isInvalid}
                disabled={!canManage || isSaving}
                max={range.max}
                min={range.min}
                type="number"
                value={value}
                onChange={(event) => {
                  const raw = event.target.value
                  setPunctualityDraft((current) => ({ ...current, [field]: raw }))
                }}
              />
              {isInvalid ? (
                <span className={styles.alert} id={errorId} role="alert">
                  {t('deliveryProofSettings.punctuality.rangeError', {
                    max: range.max,
                    min: range.min,
                  })}
                </span>
              ) : null}
            </label>
          )
        })}
      </div>

      {canManage ? (
        <Button
          disabled={isSaving || !isPunctualityValid}
          onClick={handleSaveSettings}
          size="sm"
          type="button"
        >
          <Icon name="save" />
          {t('deliveryProofSettings.save')}
        </Button>
      ) : null}

      {/*
       * Spec 156 T14, ADR-0069 §6: painel do interruptor, perto do efeito (`SETTINGS_PANEL_PLACEMENT`
       * — a leitura do canhoto acontece no assistente desta mesma tela). Molde de
       * `CameraMeasurementSettingsPanel` (spec 152 D14): selo "Experimental" ao lado do efeito e
       * estimativa de peso, desligado por padrão em toda instalação.
       */}
      <section className={styles.panel} aria-labelledby="canhoto-ocr-title">
        <h3 className={styles.hint} id="canhoto-ocr-title">
          {t('deliveryProofSettings.canhotoOcr.title')}
        </h3>
        <p className={styles.hint}>{t('deliveryProofSettings.canhotoOcr.hint')}</p>
        <p className={styles.hint}>
          <Icon aria-hidden="true" name="camera" />{' '}
          {t('deliveryProofSettings.canhotoOcr.experimental')}
        </p>
        <p className={canhotoOcrEnabled === true ? styles.settingsStatusOn : styles.hint}>
          {t(
            canhotoOcrEnabled === true
              ? 'deliveryProofSettings.canhotoOcr.on'
              : 'deliveryProofSettings.canhotoOcr.off',
          )}
        </p>
        {canManage ? (
          <Button
            disabled={isTogglingCanhotoOcr}
            onClick={() => onToggleCanhotoOcr(effective, canhotoOcrEnabled !== true)}
            size="sm"
            type="button"
            variant={canhotoOcrEnabled === true ? 'secondary' : 'default'}
          >
            <Icon name="power" />
            {t(
              canhotoOcrEnabled === true
                ? 'deliveryProofSettings.canhotoOcr.disable'
                : 'deliveryProofSettings.canhotoOcr.enable',
            )}
          </Button>
        ) : null}
      </section>

      <h3 className={styles.hint}>{t('deliveryProofSettings.overrides.title')}</h3>
      <p className={styles.hint}>{t('deliveryProofSettings.overrides.hint')}</p>

      {overrides.length === 0 ? (
        <p className={styles.hint}>{t('deliveryProofSettings.overrides.empty')}</p>
      ) : null}

      {overrides.map((override) => (
        <div className={styles.fieldGrid} key={override.taxId}>
          <span>{formatTaxId(override.taxId)}</span>
          {DELIVERY_PROOF_FIELDS.map((field) => (
            <span className={styles.hint} key={field}>
              {t(`deliveryProofSettings.fields.${field}`)}:{' '}
              {t(`deliveryProofSettings.modes.${override[field]}`)}
            </span>
          ))}
          {canManage ? (
            <Button
              disabled={isSaving}
              onClick={() => handleRemoveOverride(override.taxId)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="trash" />
              {t('deliveryProofSettings.overrides.remove')}
            </Button>
          ) : null}
        </div>
      ))}

      {canManage ? (
        <div className={styles.fieldGrid}>
          {/*
           * ⚠️ CNPJ alfanumérico: nunca teclado numérico — ele não tem letra. O `onChange`
           * canonicaliza enquanto se digita (sem máscara, caixa alta).
           */}
          <input
            aria-label={t('deliveryProofSettings.overrides.taxId')}
            onChange={(event) => setOverrideTaxId(normalizeTaxId(event.target.value))}
            placeholder={t('deliveryProofSettings.overrides.taxId')}
            type="text"
            value={overrideTaxId}
          />
          {DELIVERY_PROOF_FIELDS.map((field) =>
            renderModeSelect({
              field,
              onChange: (changed, mode) =>
                setOverrideDraft((current) => ({ ...current, [changed]: mode })),
              value: mergeDeliveryProofSettings({ base: general, override: overrideDraft })[field],
            }),
          )}
          <Button
            disabled={isSaving || !isOverrideTaxIdComplete || isOverrideDuplicated}
            onClick={handleAddOverride}
            size="sm"
            type="button"
          >
            <Icon name="add" />
            {t('deliveryProofSettings.overrides.add')}
          </Button>
        </div>
      ) : null}
    </section>
  )
}
