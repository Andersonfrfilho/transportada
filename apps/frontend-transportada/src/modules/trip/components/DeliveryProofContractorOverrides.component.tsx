/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'

import { contractorLabel, type ContractorSummary } from '../shared/contractorSummary.service'
import {
  mergeDeliveryProofSettings,
  type DeliveryProofFieldSettings,
  type DeliveryProofSettingsContractorOverride,
} from '../shared/deliveryProofSettings.service'
import styles from '../styles/trip.module.css'

import { DeliveryProofModeSummaries } from './DeliveryProofModeSummaries.component'
import {
  DeliveryProofOverrideModeFields,
  type DeliveryProofOverrideAccess,
} from './DeliveryProofOverrideModeFields.component'

type DeliveryProofContractorOverridesProps = Readonly<{
  access: DeliveryProofOverrideAccess
  contractorOverrides: readonly DeliveryProofSettingsContractorOverride[]
  contractors: readonly ContractorSummary[]
  general: DeliveryProofFieldSettings
  onReplaceContractorOverrides: (
    overrides: readonly DeliveryProofSettingsContractorOverride[],
  ) => void
}>

export function DeliveryProofContractorOverrides({
  access,
  contractorOverrides,
  contractors,
  general,
  onReplaceContractorOverrides,
}: DeliveryProofContractorOverridesProps) {
  const { t } = useTranslation('trip')
  /** Spec 218 T10: a exceção por contratante — mesmo par de estado da de destinatário, por id. */
  const [overrideContractorId, setOverrideContractorId] = useState('')
  const [contractorOverrideDraft, setContractorOverrideDraft] = useState<
    Partial<DeliveryProofFieldSettings>
  >({})

  const contractorOverrideEffective = mergeDeliveryProofSettings({
    base: general,
    override: contractorOverrideDraft,
  })

  /** Spec 218 T10: mesmo formato de add/remove da exceção por destinatário, chaveado por id. */
  const isContractorOverrideDuplicated = contractorOverrides.some(
    (override) => override.contractorId === overrideContractorId,
  )

  function handleAddContractorOverride() {
    if (overrideContractorId === '' || isContractorOverrideDuplicated) return
    const override: DeliveryProofSettingsContractorOverride = {
      ...mergeDeliveryProofSettings({ base: general, override: contractorOverrideDraft }),
      contractorId: overrideContractorId,
    }
    onReplaceContractorOverrides([...contractorOverrides, override])
    setOverrideContractorId('')
    setContractorOverrideDraft({})
  }

  function handleRemoveContractorOverride(contractorId: string) {
    onReplaceContractorOverrides(
      contractorOverrides.filter((override) => override.contractorId !== contractorId),
    )
  }

  function contractorLabelOf(contractorId: string): string {
    const contractor = contractors.find((candidate) => candidate.id === contractorId)
    return contractor === undefined ? contractorId : contractorLabel(contractor)
  }

  return (
    <>
      {/* Spec 218 RF-C1/RF-C4: a segunda exceção, pelo contratante (embarcador/emitente da nota). */}
      <h3 className={styles.hint}>{t('deliveryProofSettings.contractorOverrides.title')}</h3>
      <p className={styles.hint}>{t('deliveryProofSettings.contractorOverrides.hint')}</p>

      {contractorOverrides.length === 0 ? (
        <p className={styles.hint}>{t('deliveryProofSettings.contractorOverrides.empty')}</p>
      ) : null}

      {contractorOverrides.map((override) => (
        <div className={styles.fieldGrid} key={override.contractorId}>
          <span>{contractorLabelOf(override.contractorId)}</span>
          <DeliveryProofModeSummaries settings={override} />
          {access.canManage ? (
            <Button
              disabled={access.isSaving}
              onClick={() => handleRemoveContractorOverride(override.contractorId)}
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

      {access.canManage ? (
        <div className={styles.fieldGrid}>
          <label>
            <span className={styles.hint}>
              {t('deliveryProofSettings.contractorOverrides.contractor')}
            </span>
            <Select
              ariaLabel={t('deliveryProofSettings.contractorOverrides.contractor')}
              disabled={access.isSaving}
              onChange={setOverrideContractorId}
              options={contractors.map((contractor) => ({
                label: contractorLabel(contractor),
                value: contractor.id,
              }))}
              placeholder={t('deliveryProofSettings.contractorOverrides.contractorPlaceholder')}
              value={overrideContractorId}
            />
          </label>
          <DeliveryProofOverrideModeFields
            effective={contractorOverrideEffective}
            isDisabled={access.isSaving}
            onChangeCargoMinimum={(count) =>
              setContractorOverrideDraft((current) => ({ ...current, cargoMinimumCount: count }))
            }
            onChangeMode={(changed, mode) =>
              setContractorOverrideDraft((current) => ({ ...current, [changed]: mode }))
            }
          />
          <Button
            disabled={
              access.isSaving || overrideContractorId === '' || isContractorOverrideDuplicated
            }
            onClick={handleAddContractorOverride}
            size="sm"
            type="button"
          >
            <Icon name="add" />
            {t('deliveryProofSettings.overrides.add')}
          </Button>
        </div>
      ) : null}
    </>
  )
}
