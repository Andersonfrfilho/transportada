/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 *
 * Spec 218 RF-B1/RF-B3/RF-B4: a seção "Exceções" de um tipo do catálogo — duas listas editáveis
 * (contratante/destinatário) do `attachmentMode` daquele tipo, colapsada por padrão como o resto do
 * painel (`OccurrenceTypeCatalogPanel`). Componente próprio porque a busca só liga quando a seção
 * abre (`enabled: isExpanded`) — chamar o hook dentro do `.map()` do pai violaria as regras de hooks
 * a cada tipo adicionado/removido.
 */
import { useState } from 'react'
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
  contractorLabel,
  type ContractorSummary,
} from '@/modules/trip/shared/contractorSummary.service'
import type { OccurrenceAttachmentMode } from '@/modules/trip/shared/occurrence.constant'
import {
  useOccurrenceAttachmentOverridesQuery,
  useReplaceOccurrenceAttachmentOverridesMutation,
} from '@/modules/trip/queries/useOccurrenceAttachmentOverrides.query'
import styles from '@/modules/trip/styles/trip.module.css'

type OccurrenceTypeExceptionsSectionProps = Readonly<{
  canManage: boolean
  contractors: readonly ContractorSummary[]
  isDisabled: boolean
  occurrenceTypeId: string
}>

export function OccurrenceTypeExceptionsSection({
  canManage,
  contractors,
  isDisabled,
  occurrenceTypeId,
}: OccurrenceTypeExceptionsSectionProps) {
  const { t } = useTranslation('companySettings')
  const [isExpanded, setIsExpanded] = useState(false)
  const [contractorId, setContractorId] = useState('')
  const [contractorMode, setContractorMode] = useState<OccurrenceAttachmentMode>('off')
  const [recipientTaxId, setRecipientTaxId] = useState('')
  const [recipientMode, setRecipientMode] = useState<OccurrenceAttachmentMode>('off')

  const overridesQuery = useOccurrenceAttachmentOverridesQuery({
    enabled: isExpanded,
    occurrenceTypeId,
  })
  const replaceMutation = useReplaceOccurrenceAttachmentOverridesMutation()

  const contractorOverrides = overridesQuery.data?.contractorOverrides ?? []
  const recipientOverrides = overridesQuery.data?.recipientOverrides ?? []
  const isSaving = isDisabled || replaceMutation.isPending

  const attachmentModeOptions = [
    { label: t('occurrenceTypeCatalog.attachmentModeOff'), value: 'off' },
    { label: t('occurrenceTypeCatalog.attachmentModeOptional'), value: 'optional' },
    { label: t('occurrenceTypeCatalog.attachmentModeRequired'), value: 'required' },
  ]

  const isContractorDuplicated = contractorOverrides.some(
    (override) => override.contractorId === contractorId,
  )
  const isRecipientTaxIdComplete =
    CPF_PATTERN.test(recipientTaxId) || CNPJ_PATTERN.test(recipientTaxId)
  const isRecipientDuplicated = recipientOverrides.some(
    (override) => override.taxId === recipientTaxId,
  )

  function contractorLabelOf(id: string): string {
    const contractor = contractors.find((candidate) => candidate.id === id)
    return contractor === undefined ? id : contractorLabel(contractor)
  }

  function handleAddContractorOverride() {
    if (contractorId === '' || isContractorDuplicated) return
    replaceMutation.mutate({
      contractorOverrides: [
        ...contractorOverrides,
        { attachmentMode: contractorMode, contractorId },
      ],
      occurrenceTypeId,
      recipientOverrides,
    })
    setContractorId('')
    setContractorMode('off')
  }

  function handleRemoveContractorOverride(id: string) {
    replaceMutation.mutate({
      contractorOverrides: contractorOverrides.filter((override) => override.contractorId !== id),
      occurrenceTypeId,
      recipientOverrides,
    })
  }

  function handleAddRecipientOverride() {
    if (!isRecipientTaxIdComplete || isRecipientDuplicated) return
    replaceMutation.mutate({
      contractorOverrides,
      occurrenceTypeId,
      recipientOverrides: [
        ...recipientOverrides,
        { attachmentMode: recipientMode, taxId: recipientTaxId },
      ],
    })
    setRecipientTaxId('')
    setRecipientMode('off')
  }

  function handleRemoveRecipientOverride(taxId: string) {
    replaceMutation.mutate({
      contractorOverrides,
      occurrenceTypeId,
      recipientOverrides: recipientOverrides.filter((override) => override.taxId !== taxId),
    })
  }

  return (
    <div className={styles.occurrenceStage}>
      <Button
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((current) => !current)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Icon name={isExpanded ? 'chevron-up' : 'chevron-down'} />
        {t(
          isExpanded
            ? 'occurrenceTypeCatalog.exceptions.hide'
            : 'occurrenceTypeCatalog.exceptions.show',
        )}
      </Button>

      {isExpanded ? (
        <>
          <h4 className={styles.hint}>{t('occurrenceTypeCatalog.exceptions.contractorTitle')}</h4>
          {contractorOverrides.length === 0 ? (
            <p className={styles.hint}>{t('occurrenceTypeCatalog.exceptions.emptyContractor')}</p>
          ) : null}
          {contractorOverrides.map((override) => (
            <div className={styles.fieldGrid} key={override.contractorId}>
              <span>{contractorLabelOf(override.contractorId)}</span>
              <span className={styles.hint}>
                {t(`occurrenceTypeCatalog.attachmentMode${capitalize(override.attachmentMode)}`)}
              </span>
              {canManage ? (
                <Button
                  disabled={isSaving}
                  onClick={() => handleRemoveContractorOverride(override.contractorId)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Icon name="trash" />
                  {t('occurrenceTypeCatalog.exceptions.remove')}
                </Button>
              ) : null}
            </div>
          ))}
          {canManage ? (
            <div className={styles.fieldGrid}>
              <label>
                <span className={styles.hint}>
                  {t('occurrenceTypeCatalog.exceptions.contractor')}
                </span>
                <Select
                  ariaLabel={t('occurrenceTypeCatalog.exceptions.contractor')}
                  disabled={isSaving}
                  onChange={setContractorId}
                  options={contractors.map((contractor) => ({
                    label: contractorLabel(contractor),
                    value: contractor.id,
                  }))}
                  placeholder={t('occurrenceTypeCatalog.exceptions.contractorPlaceholder')}
                  value={contractorId}
                />
              </label>
              <Select
                ariaLabel={t('occurrenceTypeCatalog.attachmentMode')}
                disabled={isSaving}
                onChange={(value) => setContractorMode(value as OccurrenceAttachmentMode)}
                options={attachmentModeOptions}
                value={contractorMode}
              />
              <Button
                disabled={isSaving || contractorId === '' || isContractorDuplicated}
                onClick={handleAddContractorOverride}
                size="sm"
                type="button"
              >
                <Icon name="add" />
                {t('occurrenceTypeCatalog.exceptions.add')}
              </Button>
            </div>
          ) : null}

          <h4 className={styles.hint}>{t('occurrenceTypeCatalog.exceptions.recipientTitle')}</h4>
          {recipientOverrides.length === 0 ? (
            <p className={styles.hint}>{t('occurrenceTypeCatalog.exceptions.emptyRecipient')}</p>
          ) : null}
          {recipientOverrides.map((override) => (
            <div className={styles.fieldGrid} key={override.taxId}>
              <span>{formatTaxId(override.taxId)}</span>
              <span className={styles.hint}>
                {t(`occurrenceTypeCatalog.attachmentMode${capitalize(override.attachmentMode)}`)}
              </span>
              {canManage ? (
                <Button
                  disabled={isSaving}
                  onClick={() => handleRemoveRecipientOverride(override.taxId)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <Icon name="trash" />
                  {t('occurrenceTypeCatalog.exceptions.remove')}
                </Button>
              ) : null}
            </div>
          ))}
          {canManage ? (
            <div className={styles.fieldGrid}>
              <input
                aria-label={t('occurrenceTypeCatalog.exceptions.recipientTaxId')}
                onChange={(event) => setRecipientTaxId(normalizeTaxId(event.target.value))}
                placeholder={t('occurrenceTypeCatalog.exceptions.recipientTaxId')}
                type="text"
                value={recipientTaxId}
              />
              <Select
                ariaLabel={t('occurrenceTypeCatalog.attachmentMode')}
                disabled={isSaving}
                onChange={(value) => setRecipientMode(value as OccurrenceAttachmentMode)}
                options={attachmentModeOptions}
                value={recipientMode}
              />
              <Button
                disabled={isSaving || !isRecipientTaxIdComplete || isRecipientDuplicated}
                onClick={handleAddRecipientOverride}
                size="sm"
                type="button"
              >
                <Icon name="add" />
                {t('occurrenceTypeCatalog.exceptions.add')}
              </Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
