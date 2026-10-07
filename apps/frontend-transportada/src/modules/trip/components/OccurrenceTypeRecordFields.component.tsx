/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'
import {
  DECLARED_AMOUNT_SCOPES,
  type DeclaredAmountScope,
  type OccurrenceType,
} from '@/modules/trip/shared/occurrence.constant'
import { readOccurrenceRecordMode } from '@/modules/trip/shared/occurrenceRecordFields.service'
import type { OccurrenceRecordField } from '@/modules/trip/shared/occurrenceRequirement.constant'
import type { OccurrenceTypeEdit } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import styles from '@/modules/trip/styles/occurrenceTypeRequirement.module.css'

import { OccurrenceRequirementModeSelect } from './OccurrenceRequirementModeSelect.component'
import { OccurrenceTypeRecordLabel } from './OccurrenceTypeRecordLabel.component'

type OccurrenceTypeRecordFieldsProps = Readonly<{
  disabled: boolean
  fields: readonly OccurrenceRecordField[]
  /** A escolha recusada: valor pago por linha sem produtos. A mensagem fica ligada ao campo que a causou. */
  hasAmountWithoutItems: boolean
  onEdit: (edit: OccurrenceTypeEdit) => void
  type: OccurrenceType
}>

/**
 * Spec 247 RF3: "Número do documento do cliente" e "Valor pago" no mesmo seletor de três estados dos outros
 * campos, cada um com o rótulo da tela de registro; o valor pago diz também onde se digita. Só aparecem as
 * linhas que a API trouxe e que o momento do tipo cobra.
 */
export function OccurrenceTypeRecordFields({
  disabled,
  fields,
  hasAmountWithoutItems,
  onEdit,
  type,
}: OccurrenceTypeRecordFieldsProps) {
  const { t } = useTranslation('companySettings')
  const alertId = useId()
  const scopeLabel = t('occurrenceTypeCatalog.requirements.record.scope')

  if (fields.length === 0) return null

  return (
    <div className={styles.records}>
      {fields.includes('referenceNumber') ? (
        <div className={styles.record}>
          <OccurrenceRequirementModeSelect
            disabled={disabled}
            field="referenceNumber"
            onChange={(mode) => onEdit({ referenceNumberMode: mode })}
            value={readOccurrenceRecordMode(type, 'referenceNumber')}
          />
          <OccurrenceTypeRecordLabel
            disabled={disabled}
            label={t('occurrenceTypeCatalog.requirements.record.referenceLabel')}
            onCommit={(value) => onEdit({ referenceNumberLabel: value })}
            value={type.referenceNumberLabel ?? ''}
          />
        </div>
      ) : null}
      {fields.includes('declaredAmount') ? (
        <div
          aria-describedby={hasAmountWithoutItems ? alertId : undefined}
          className={styles.record}
          role="group"
        >
          <OccurrenceRequirementModeSelect
            disabled={disabled}
            field="declaredAmount"
            onChange={(mode) => onEdit({ declaredAmountMode: mode })}
            value={readOccurrenceRecordMode(type, 'declaredAmount')}
          />
          <div className={styles.field}>
            <span aria-hidden="true" className={styles.fieldLabel}>
              {t('occurrenceTypeCatalog.requirements.record.scopeTitle')}
            </span>
            <Select
              ariaLabel={scopeLabel}
              disabled={disabled}
              onChange={(next) => onEdit({ declaredAmountScope: next as DeclaredAmountScope })}
              options={DECLARED_AMOUNT_SCOPES.map((scope) => ({
                label: t(`occurrenceTypeCatalog.requirements.record.scopes.${scope}`),
                value: scope,
              }))}
              value={type.declaredAmountScope ?? 'item'}
            />
          </div>
          <OccurrenceTypeRecordLabel
            disabled={disabled}
            label={t('occurrenceTypeCatalog.requirements.record.amountLabel')}
            onCommit={(value) => onEdit({ declaredAmountLabel: value })}
            value={type.declaredAmountLabel ?? ''}
          />
          {hasAmountWithoutItems ? (
            <p className={styles.alert} id={alertId} role="alert">
              {t('occurrenceTypeCatalog.requirements.record.amountWithoutItems')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
