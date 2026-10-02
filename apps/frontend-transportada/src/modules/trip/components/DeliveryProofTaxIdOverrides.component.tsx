/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import {
  CNPJ_PATTERN,
  CPF_PATTERN,
  formatTaxId,
  normalizeTaxId,
} from '@/modules/shared/taxId.service'

import {
  mergeDeliveryProofSettings,
  upsertDeliveryProofOverride,
  type DeliveryProofFieldSettings,
  type DeliveryProofSettingsOverride,
} from '../shared/deliveryProofSettings.service'
import styles from '../styles/trip.module.css'

import { DeliveryProofModeSummaries } from './DeliveryProofModeSummaries.component'
import {
  DeliveryProofOverrideModeFields,
  type DeliveryProofOverrideAccess,
} from './DeliveryProofOverrideModeFields.component'

type DeliveryProofTaxIdOverridesProps = Readonly<{
  access: DeliveryProofOverrideAccess
  general: DeliveryProofFieldSettings
  onReplaceOverrides: (overrides: readonly DeliveryProofSettingsOverride[]) => void
  overrides: readonly DeliveryProofSettingsOverride[]
}>

export function DeliveryProofTaxIdOverrides({
  access,
  general,
  onReplaceOverrides,
  overrides,
}: DeliveryProofTaxIdOverridesProps) {
  const { t } = useTranslation('trip')
  const [overrideTaxId, setOverrideTaxId] = useState('')
  const [overrideDraft, setOverrideDraft] = useState<Partial<DeliveryProofFieldSettings>>({})
  /** O CNPJ/CPF gravado da exceção em edição; `undefined` é o formulário em modo adicionar. */
  const [editingTaxId, setEditingTaxId] = useState<string | undefined>(undefined)

  const overrideEffective = mergeDeliveryProofSettings({ base: general, override: overrideDraft })

  /** Pelo conjunto, não pelo comprimento: o CNPJ tem letra na base, e onze dígitos podem ser CPF. */
  const isOverrideTaxIdComplete =
    CPF_PATTERN.test(overrideTaxId) || CNPJ_PATTERN.test(overrideTaxId)
  const isEditing = editingTaxId !== undefined
  /** Em edição o próprio item não conta: salvar sem trocar o CNPJ não é duplicar. */
  const isOverrideDuplicated = overrides.some(
    (override) => override.taxId === overrideTaxId && override.taxId !== editingTaxId,
  )

  function resetForm() {
    setEditingTaxId(undefined)
    setOverrideTaxId('')
    setOverrideDraft({})
  }

  function handleSubmitOverride() {
    if (!isOverrideTaxIdComplete || isOverrideDuplicated) return
    const override: DeliveryProofSettingsOverride = {
      ...mergeDeliveryProofSettings({ base: general, override: overrideDraft }),
      taxId: overrideTaxId,
    }
    onReplaceOverrides([
      ...upsertDeliveryProofOverride({
        ...(editingTaxId === undefined ? {} : { editingKey: editingTaxId }),
        keyOf: (current) => current.taxId,
        override,
        overrides,
      }),
    ])
    resetForm()
  }

  function handleStartEditOverride(override: DeliveryProofSettingsOverride) {
    setEditingTaxId(override.taxId)
    setOverrideTaxId(override.taxId)
    setOverrideDraft(override)
  }

  function handleRemoveOverride(taxId: string) {
    if (taxId === editingTaxId) resetForm()
    onReplaceOverrides(overrides.filter((override) => override.taxId !== taxId))
  }

  return (
    <>
      <h3 className={styles.hint}>{t('deliveryProofSettings.overrides.title')}</h3>
      <p className={styles.hint}>{t('deliveryProofSettings.overrides.hint')}</p>

      {overrides.length === 0 ? (
        <p className={styles.hint}>{t('deliveryProofSettings.overrides.empty')}</p>
      ) : null}

      {overrides.map((override) => (
        <div className={styles.fieldGrid} key={override.taxId}>
          <span>{formatTaxId(override.taxId)}</span>
          <DeliveryProofModeSummaries settings={override} />
          {access.canManage ? (
            <>
              <Button
                disabled={access.isSaving || override.taxId === editingTaxId}
                onClick={() => handleStartEditOverride(override)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Icon name="edit" />
                {t('deliveryProofSettings.overrides.edit')}
              </Button>
              <Button
                disabled={access.isSaving}
                onClick={() => handleRemoveOverride(override.taxId)}
                size="sm"
                type="button"
                variant="ghost"
              >
                <Icon name="trash" />
                {t('deliveryProofSettings.overrides.remove')}
              </Button>
            </>
          ) : null}
        </div>
      ))}

      {access.canManage ? (
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
          <DeliveryProofOverrideModeFields
            effective={overrideEffective}
            isDisabled={access.isSaving}
            onChangeCargoMinimum={(count) =>
              setOverrideDraft((current) => ({ ...current, cargoMinimumCount: count }))
            }
            onChangeMode={(changed, mode) =>
              setOverrideDraft((current) => ({ ...current, [changed]: mode }))
            }
          />
          <Button
            disabled={access.isSaving || !isOverrideTaxIdComplete || isOverrideDuplicated}
            onClick={handleSubmitOverride}
            size="sm"
            type="button"
          >
            <Icon name={isEditing ? 'check' : 'add'} />
            {t(
              isEditing
                ? 'deliveryProofSettings.overrides.saveChanges'
                : 'deliveryProofSettings.overrides.add',
            )}
          </Button>
          {isEditing ? (
            <Button
              disabled={access.isSaving}
              onClick={resetForm}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="close" />
              {t('deliveryProofSettings.overrides.cancelEdit')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  )
}
