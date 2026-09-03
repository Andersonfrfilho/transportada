/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { formatTaxId, normalizeTaxId } from '@/modules/shared/taxId.service'

import {
  DEFAULT_DELIVERY_PROOF_SETTINGS,
  DELIVERY_PROOF_FIELD_MODES,
  DELIVERY_PROOF_FIELDS,
  type DeliveryProofField,
  type DeliveryProofFieldMode,
  type DeliveryProofFieldSettings,
  type DeliveryProofSettingsOverride,
} from '../shared/deliveryProofSettings.service'
import styles from '../styles/trip.module.css'

const CPF_LENGTH = 11
const CNPJ_LENGTH = 14

type TripDeliveryProofSettingsPanelProps = Readonly<{
  canManage: boolean
  isSaving: boolean
  onReplaceOverrides: (overrides: readonly DeliveryProofSettingsOverride[]) => void
  onSaveSettings: (settings: DeliveryProofFieldSettings) => void
  overrides: readonly DeliveryProofSettingsOverride[]
  settings: DeliveryProofFieldSettings | undefined
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
  isSaving,
  onReplaceOverrides,
  onSaveSettings,
  overrides,
  settings,
  showError,
}: TripDeliveryProofSettingsPanelProps) {
  const { t } = useTranslation('trip')
  const [draft, setDraft] = useState<Partial<DeliveryProofFieldSettings>>({})
  const [overrideTaxId, setOverrideTaxId] = useState('')
  const [overrideDraft, setOverrideDraft] = useState<Partial<DeliveryProofFieldSettings>>({})

  const general = settings ?? DEFAULT_DELIVERY_PROOF_SETTINGS
  const effective: DeliveryProofFieldSettings = { ...general, ...draft }

  const modeOptions = DELIVERY_PROOF_FIELD_MODES.map((mode) => ({
    label: t(`deliveryProofSettings.modes.${mode}`),
    value: mode,
  }))

  const isOverrideTaxIdComplete =
    overrideTaxId.length === CPF_LENGTH || overrideTaxId.length === CNPJ_LENGTH
  const isOverrideDuplicated = overrides.some((override) => override.taxId === overrideTaxId)

  function handleSaveSettings() {
    onSaveSettings(effective)
  }

  function handleAddOverride() {
    if (!isOverrideTaxIdComplete || isOverrideDuplicated) return
    const override: DeliveryProofSettingsOverride = {
      ...general,
      ...overrideDraft,
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

      {canManage ? (
        <Button disabled={isSaving} onClick={handleSaveSettings} size="sm" type="button">
          <Icon name="save" />
          {t('deliveryProofSettings.save')}
        </Button>
      ) : null}

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
              value: { ...general, ...overrideDraft }[field],
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
