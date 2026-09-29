/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 RF-E1/RF-E2 (P6 do spec.md): a tela de verificação — o operador escolhe um contratante
 * e/ou um destinatário e vê, lado a lado, o comprovante efetivo e o `attachmentMode` efetivo de
 * cada tipo de ocorrência, a mesma resolução de 3 camadas que o app do motorista aplicaria. Sem
 * escolha nenhuma, mostra a configuração geral (sem override) — os dados já carregados de
 * `useDeliveryProofSettingsQuery`/`useOccurrenceTypeCatalogPanel`, sem chamar a rota nova.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'
import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'
import {
  CNPJ_PATTERN,
  CPF_PATTERN,
  formatTaxId,
  normalizeTaxId,
} from '@/modules/shared/taxId.service'
import {
  contractorLabel,
  type ContractorSummary,
} from '@/modules/trip/shared/contractorSummary.service'
import { useContractorsQuery } from '@/modules/trip/queries/useContractors.query'
import { useDeliveryProofSettingsQuery } from '@/modules/trip/queries/useDeliveryProofSettings.query'
import { useSettingsResolutionQuery } from '@/modules/trip/queries/useSettingsResolution.query'
import { DELIVERY_PROOF_FIELDS } from '@/modules/trip/shared/deliveryProofSettings.service'
import { TRIP_OCCURRENCE_STAGE } from '@/modules/trip/shared/occurrence.constant'
import type { SettingsResolutionOccurrenceType } from '@/modules/trip/shared/settingsResolution.service'
import styles from '@/modules/trip/styles/trip.module.css'

import { useOccurrenceTypeCatalogPanel } from '../hooks/useOccurrenceTypeCatalogPanel.hook'

export type SettingsResolutionPanelProps = Readonly<{ canManage: boolean }>

export function SettingsResolutionPanel({ canManage }: SettingsResolutionPanelProps) {
  const { t } = useTranslation('companySettings')
  const [contractorId, setContractorId] = useState('')
  const [recipientTaxIdInput, setRecipientTaxIdInput] = useState('')

  const contractorsQuery = useContractorsQuery({ enabled: canManage })
  const generalSettingsQuery = useDeliveryProofSettingsQuery({ enabled: canManage })
  const occurrenceTypesPanel = useOccurrenceTypeCatalogPanel({ enabled: canManage })

  const isRecipientTaxIdComplete =
    CPF_PATTERN.test(recipientTaxIdInput) || CNPJ_PATTERN.test(recipientTaxIdInput)
  const hasSelection = contractorId !== '' || isRecipientTaxIdComplete

  const resolutionQuery = useSettingsResolutionQuery({
    contractorId: contractorId === '' ? null : contractorId,
    recipientTaxId: isRecipientTaxIdComplete ? recipientTaxIdInput : null,
  })

  const deliveryProof = hasSelection
    ? resolutionQuery.data?.deliveryProof
    : generalSettingsQuery.data
  const occurrenceTypes: readonly SettingsResolutionOccurrenceType[] | undefined = hasSelection
    ? resolutionQuery.data?.occurrenceTypes
    : (occurrenceTypesPanel.query.data ?? [])
        .filter((type) => type.active && type.stage === TRIP_OCCURRENCE_STAGE.delivery)
        .map((type) => ({
          attachmentMode: type.attachmentMode,
          flow: type.flow,
          id: type.id,
          name: type.name,
          stage: TRIP_OCCURRENCE_STAGE.delivery,
        }))

  const isLoading = hasSelection
    ? resolutionQuery.isLoading
    : generalSettingsQuery.isLoading || occurrenceTypesPanel.query.isLoading
  const isError = hasSelection
    ? resolutionQuery.isError
    : generalSettingsQuery.isError || occurrenceTypesPanel.query.isError

  function contractorLabelOf(id: string): string {
    const contractor = (contractorsQuery.data ?? []).find(
      (candidate: ContractorSummary) => candidate.id === id,
    )
    return contractor === undefined ? id : contractorLabel(contractor)
  }

  return (
    <section className={styles.panel}>
      <h3 className={styles.hint}>{t('settingsResolution.title')}</h3>
      <p className={styles.hint}>{t('settingsResolution.hint')}</p>

      <div className={styles.fieldGrid}>
        <label>
          <span className={styles.hint}>{t('settingsResolution.contractor')}</span>
          <Select
            ariaLabel={t('settingsResolution.contractor')}
            clearable
            disabled={contractorsQuery.isLoading}
            onChange={setContractorId}
            options={(contractorsQuery.data ?? []).map((contractor) => ({
              label: contractorLabel(contractor),
              value: contractor.id,
            }))}
            placeholder={t('settingsResolution.contractorPlaceholder')}
            value={contractorId}
          />
        </label>
        <label>
          <span className={styles.hint}>{t('settingsResolution.recipientTaxId')}</span>
          <input
            aria-label={t('settingsResolution.recipientTaxId')}
            onChange={(event) => setRecipientTaxIdInput(normalizeTaxId(event.target.value))}
            placeholder={t('settingsResolution.recipientTaxId')}
            type="text"
            value={recipientTaxIdInput}
          />
        </label>
      </div>

      {!hasSelection ? <p className={styles.hint}>{t('settingsResolution.generalHint')}</p> : null}
      {isError ? (
        <p className={styles.alert} role="alert">
          {t('settingsResolution.error')}
        </p>
      ) : null}

      {isLoading ? (
        <SkeletonGroup label={t('settingsResolution.loading')}>
          <Skeleton height="7rem" width="100%" />
        </SkeletonGroup>
      ) : (
        <>
          <h4 className={styles.hint}>{t('settingsResolution.deliveryProofTitle')}</h4>
          <div className={styles.fieldGrid}>
            {DELIVERY_PROOF_FIELDS.map((field) => (
              <span key={field}>
                <span className={styles.hint}>{t(`settingsResolution.fields.${field}`)}: </span>
                {deliveryProof === undefined
                  ? '—'
                  : t(`settingsResolution.modes.${deliveryProof[field]}`)}
              </span>
            ))}
          </div>

          <h4 className={styles.hint}>{t('settingsResolution.occurrenceTypesTitle')}</h4>
          {(occurrenceTypes ?? []).length === 0 ? (
            <p className={styles.hint}>{t('settingsResolution.occurrenceTypesEmpty')}</p>
          ) : null}
          {(occurrenceTypes ?? []).map((type) => (
            <div className={styles.fieldGrid} key={type.id}>
              <span>{type.name}</span>
              <span className={styles.hint}>
                {t(`settingsResolution.modes.${type.attachmentMode}`)}
              </span>
            </div>
          ))}

          {hasSelection && contractorId !== '' ? (
            <p className={styles.hint}>
              {t('settingsResolution.contractorSelected', {
                contractor: contractorLabelOf(contractorId),
              })}
            </p>
          ) : null}
          {hasSelection && isRecipientTaxIdComplete ? (
            <p className={styles.hint}>
              {t('settingsResolution.recipientSelected', {
                recipient: formatTaxId(recipientTaxIdInput),
              })}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
