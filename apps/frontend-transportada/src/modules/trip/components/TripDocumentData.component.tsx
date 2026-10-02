/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { CopyButton } from '@/components/ui/copy-button'
import { DeliveryClientLink } from '@/modules/delivery-clients/components/DeliveryClientLink.component'
import { formatAmount } from '@/modules/shared/decimalAmount.service'
import { formatTaxId, isIndividualTaxId } from '@/modules/shared/taxId.service'
import { TripDocumentCost } from '@/modules/trip-financials/components/TripDocumentCost.component'
import { TripDocumentCostCriterion } from '@/modules/trip-financials/components/TripDocumentCostCriterion.component'
import { useHasDocumentCost } from '@/modules/trip-financials/hooks/useDocumentCostLine.hook'

import type { TripDocumentDetail } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

type TripDocumentDataProps = Readonly<{ document: TripDocumentDetail }>

type DataField = Readonly<{
  copyLabelKey: string
  key: string
  labelKey: string
  value: string
}>

const NON_BREAKING_SPACE = /\u00a0/gu

function hasText(value: null | string | undefined): value is string {
  return value !== null && value !== undefined && value.trim() !== ''
}

/** Só o que existe vira campo: sem permissão, sem volume ou sem CNPJ não sobra rótulo vazio. */
function buildDataFields(document: TripDocumentDetail): readonly DataField[] {
  const fields: DataField[] = []
  const { contact, nfeNumber, nfeSeries, nfeTotalValue, volumeCount } = document

  if (hasText(nfeNumber)) {
    fields.push({
      copyLabelKey: 'documentData.copy.nfeNumber',
      key: 'nfeNumber',
      labelKey: 'documentData.nfeNumber',
      value: nfeNumber.trim(),
    })
  }
  if (hasText(nfeSeries)) {
    fields.push({
      copyLabelKey: 'documentData.copy.series',
      key: 'series',
      labelKey: 'documentData.series',
      value: nfeSeries.trim(),
    })
  }
  if (contact !== null && contact !== undefined && hasText(contact.name)) {
    fields.push({
      copyLabelKey: 'documentData.copy.client',
      key: 'client',
      labelKey: 'documentData.client',
      value: contact.name,
    })
  }
  if (contact !== null && contact !== undefined && hasText(contact.taxId)) {
    const isIndividual = isIndividualTaxId(contact.taxId)
    fields.push({
      copyLabelKey: isIndividual ? 'documentData.copy.cpf' : 'documentData.copy.taxId',
      key: 'taxId',
      labelKey: isIndividual ? 'documentData.cpf' : 'documentData.taxId',
      value: formatTaxId(contact.taxId),
    })
  }
  if (hasText(nfeTotalValue)) {
    fields.push({
      copyLabelKey: 'documentData.copy.cargoValue',
      key: 'cargoValue',
      labelKey: 'documentData.cargoValue',
      // O espaço inseparável do `Intl` não cola bem num formulário: copia-se o que se vê, com espaço comum.
      value: formatAmount(nfeTotalValue).replace(NON_BREAKING_SPACE, ' '),
    })
  }
  if (typeof volumeCount === 'number') {
    fields.push({
      copyLabelKey: 'documentData.copy.volumes',
      key: 'volumes',
      labelKey: 'documentData.volumes',
      value: String(volumeCount),
    })
  }
  return fields
}

/** Spec 227 RF3/RF4: a identidade da nota, copiável campo a campo, e o custo e lucro (226) abaixo dela. */
export function TripDocumentData({ document }: TripDocumentDataProps) {
  const { t } = useTranslation('trip')
  const hasDocumentCost = useHasDocumentCost(document.id)
  const fields = buildDataFields(document)
  const { contact, freightRuleName } = document
  const hasContractor = hasText(contact?.contractorName)
  const hasRule = hasText(freightRuleName)
  const hasContact = contact !== null && contact !== undefined

  if (fields.length === 0 && !hasContact && !hasRule && !hasDocumentCost) return null

  const titleId = `trip-document-data-${document.id}`

  return (
    <section aria-labelledby={titleId} className={styles.documentData}>
      <p className={styles.documentDataTitle} id={titleId}>
        {t('documentData.title')}
      </p>
      {fields.length === 0 ? null : (
        <dl className={styles.documentDataGrid}>
          {fields.map((field) => (
            <div className={styles.documentDataField} key={field.key}>
              <dt className={styles.documentDataLabel}>{t(field.labelKey)}</dt>
              <dd className={styles.documentDataValue}>
                <span className={styles.documentDataText}>{field.value}</span>
                <CopyButton
                  copiedLabel={t('documentData.copied')}
                  label={t(field.copyLabelKey)}
                  value={field.value}
                />
                {field.key === 'client' ? (
                  <DeliveryClientLink
                    className={styles.documentDataLink}
                    clientName={field.value}
                  />
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {hasContact || hasRule ? (
        <div className={styles.stopDocumentDetailGroup}>
          {hasContact ? (
            <span className={styles.stopDocumentMeta}>
              {contact.phone === null
                ? t('contact.withoutPhone')
                : t('contact.phone', { phone: contact.phone })}
            </span>
          ) : null}
          {hasContractor && contact !== null && contact !== undefined ? (
            <span className={styles.stopDocumentMeta}>
              {t('contact.contractor', { name: contact.contractorName })}
            </span>
          ) : null}
          {hasRule ? (
            <span className={styles.stopDocumentMeta}>
              {t('stops.freight.rule', { name: freightRuleName })}
            </span>
          ) : null}
        </div>
      ) : null}
      {hasDocumentCost ? (
        <div className={styles.documentDataCost}>
          <p className={styles.documentDataTitle}>{t('documentData.costTitle')}</p>
          {/* Spec 226 RF4/RF6: o gasto vem do contexto da avaliação — sem `trip.financials` não imprime nada. */}
          <TripDocumentCost documentId={document.id} />
          <TripDocumentCostCriterion documentId={document.id} />
        </div>
      ) : null}
    </section>
  )
}
