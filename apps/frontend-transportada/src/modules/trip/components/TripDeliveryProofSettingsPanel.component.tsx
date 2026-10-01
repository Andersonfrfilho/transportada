/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { ContractorSummary } from '../shared/contractorSummary.service'
import { PANEL_MODE_FIELDS, type PanelModeField } from '../shared/deliveryProofPanelFields.constant'
import {
  DEFAULT_DELIVERY_PROOF_SETTINGS,
  mergeDeliveryProofSettings,
  type CompanyDeliveryProofSettings,
  type DeliveryProofFieldMode,
  type DeliveryProofFieldSettings,
  type DeliveryProofSettingsContractorOverride,
  type DeliveryProofSettingsOverride,
} from '../shared/deliveryProofSettings.service'
import { useDeliveryProofPunctualityDraft } from '../hooks/useDeliveryProofPunctualityDraft.hook'
import styles from '../styles/trip.module.css'

import { CanhotoOcrSection } from './CanhotoOcrSection.component'
import { DeliveryProofCargoSection } from './DeliveryProofCargoSection.component'
import { DeliveryProofContractorOverrides } from './DeliveryProofContractorOverrides.component'
import { DeliveryProofModeSelect } from './DeliveryProofModeSelect.component'
import { DeliveryProofPunctualityFields } from './DeliveryProofPunctualityFields.component'
import { DeliveryProofTaxIdOverrides } from './DeliveryProofTaxIdOverrides.component'

type TripDeliveryProofSettingsPanelProps = Readonly<{
  canManage: boolean
  /** Spec 156 T14, ADR-0069 §6: `undefined` enquanto carrega — o painel some por trás do skeleton. */
  canhotoOcrEnabled: boolean | undefined
  /** Spec 218 T10: o mesmo seletor de contratante do painel de contatos, para a exceção nova. */
  contractorOverrides: readonly DeliveryProofSettingsContractorOverride[]
  contractors: readonly ContractorSummary[]
  isSaving: boolean
  isTogglingCanhotoOcr: boolean
  onReplaceContractorOverrides: (
    overrides: readonly DeliveryProofSettingsContractorOverride[],
  ) => void
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
  contractorOverrides,
  contractors,
  isSaving,
  isTogglingCanhotoOcr,
  onReplaceContractorOverrides,
  onReplaceOverrides,
  onSaveSettings,
  onToggleCanhotoOcr,
  overrides,
  settings,
  showError,
}: TripDeliveryProofSettingsPanelProps) {
  const { t } = useTranslation('trip')
  const [draft, setDraft] = useState<Partial<DeliveryProofFieldSettings>>({})

  const general = settings ?? DEFAULT_DELIVERY_PROOF_SETTINGS
  const effective = mergeDeliveryProofSettings({ base: general, override: draft })
  const punctuality = useDeliveryProofPunctualityDraft(settings)
  const isDisabled = !canManage || isSaving
  const overrideAccess = { canManage, isSaving }

  function handleSaveSettings() {
    if (!punctuality.isValid) return
    onSaveSettings({
      ...effective,
      /**
       * Spec 156 T14, ADR-0069 §6: `saveDeliveryProofSettings` nunca manda este campo no corpo — o
       * `PUT` o trata como opcional e "ausente não mexe". Ele só entra aqui para satisfazer o tipo
       * `CompanyDeliveryProofSettings`; quem liga/desliga de verdade é `onToggleCanhotoOcr`.
       */
      canhotoOcrEnabled: canhotoOcrEnabled ?? false,
      latePenaltyPoints: punctuality.resolveValue('latePenaltyPoints'),
      missingAfterHours: punctuality.resolveValue('missingAfterHours'),
      missingPenaltyPoints: punctuality.resolveValue('missingPenaltyPoints'),
      proofRadiusMeters: punctuality.resolveValue('proofRadiusMeters'),
      proofWindowMinutes: punctuality.resolveValue('proofWindowMinutes'),
    })
  }

  function handleChangeMode(field: PanelModeField, mode: DeliveryProofFieldMode) {
    setDraft((current) => ({ ...current, [field]: mode }))
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
        {PANEL_MODE_FIELDS.filter((field) => field !== 'photo' && field !== 'cargo').map(
          (field) => (
            <DeliveryProofModeSelect
              field={field}
              isDisabled={isDisabled}
              key={field}
              onChange={handleChangeMode}
              value={effective[field]}
            />
          ),
        )}
      </div>

      {/* Spec 220 RF04: o interruptor da leitura é do canhoto — mora dentro do campo dele. */}
      <section className={styles.panel} aria-label={t('deliveryProofSettings.fields.photo')}>
        <DeliveryProofModeSelect
          field="photo"
          isDisabled={isDisabled}
          onChange={handleChangeMode}
          value={effective.photo}
        />
        <p className={styles.hint}>{t('deliveryProofSettings.photoHint')}</p>
        <CanhotoOcrSection
          canhotoOcrEnabled={canhotoOcrEnabled}
          canManage={canManage}
          effective={effective}
          isTogglingCanhotoOcr={isTogglingCanhotoOcr}
          onToggleCanhotoOcr={onToggleCanhotoOcr}
        />
      </section>

      <DeliveryProofCargoSection
        effective={effective}
        isDisabled={isDisabled}
        onChangeCargoMinimum={(count) =>
          setDraft((current) => ({ ...current, cargoMinimumCount: count }))
        }
        onChangeMode={handleChangeMode}
      />

      <h3 className={styles.hint}>{t('deliveryProofSettings.punctuality.title')}</h3>
      <p className={styles.hint}>{t('deliveryProofSettings.punctuality.hint')}</p>
      <DeliveryProofPunctualityFields
        draft={punctuality.draft}
        general={punctuality.general}
        isDisabled={isDisabled}
        onChange={punctuality.setField}
        resolveValue={punctuality.resolveValue}
      />

      {canManage ? (
        <Button
          disabled={isSaving || !punctuality.isValid}
          onClick={handleSaveSettings}
          size="sm"
          type="button"
        >
          <Icon name="save" />
          {t('deliveryProofSettings.save')}
        </Button>
      ) : null}

      <DeliveryProofTaxIdOverrides
        access={overrideAccess}
        general={general}
        onReplaceOverrides={onReplaceOverrides}
        overrides={overrides}
      />

      <DeliveryProofContractorOverrides
        access={overrideAccess}
        contractorOverrides={contractorOverrides}
        contractors={contractors}
        general={general}
        onReplaceContractorOverrides={onReplaceContractorOverrides}
      />
    </section>
  )
}
