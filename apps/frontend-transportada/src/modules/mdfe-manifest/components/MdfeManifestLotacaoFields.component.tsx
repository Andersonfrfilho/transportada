/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { formatTaxId, normalizeTaxId } from '@/modules/shared/taxId.service'

import { useLotacaoPostalCodeLookup } from '../hooks/useLotacaoPostalCodeLookup.hook'
import type { MdfeManifestFormDraft } from '../shared/mdfeManifestForm.service'
import styles from '../styles/mdfeManifest.module.css'

type MdfeManifestLotacaoFieldsProps = Readonly<{
  draft: MdfeManifestFormDraft
  onChange: <TField extends keyof MdfeManifestFormDraft>(
    field: TField,
    value: MdfeManifestFormDraft[TField],
  ) => void
}>

const CONTRACTOR_NAME_MAX_LENGTH = 60
const ENDORSEMENT_MAX_LENGTH = 40
const POSTAL_CODE_LENGTH = 8
const TAX_ID_MAX_LENGTH = 18

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

export function MdfeManifestLotacaoFields({ draft, onChange }: MdfeManifestLotacaoFieldsProps) {
  const { t } = useTranslation('mdfeManifest')
  const postalCode = useLotacaoPostalCodeLookup({
    patch: (values) => {
      if (values.loadingPostalCode !== undefined)
        onChange('loadingPostalCode', values.loadingPostalCode)
      if (values.dischargePostalCode !== undefined)
        onChange('dischargePostalCode', values.dischargePostalCode)
      if (values.destinationState !== undefined)
        onChange('destinationState', values.destinationState)
    },
  })
  return (
    <fieldset className={styles.fieldGrid}>
      <legend className={styles.hint}>{t('creation.lotacaoLegend')}</legend>
      <label>
        {t('creation.contractorName')}
        <input
          maxLength={CONTRACTOR_NAME_MAX_LENGTH}
          onChange={(event) => onChange('contractorName', event.target.value)}
          value={draft.contractorName}
        />
      </label>
      <label>
        {t('creation.contractorTaxId')}
        <input
          maxLength={TAX_ID_MAX_LENGTH}
          onChange={(event) => onChange('contractorTaxId', normalizeTaxId(event.target.value))}
          value={formatTaxId(draft.contractorTaxId)}
        />
      </label>
      <label>
        {t('creation.freightValue')}
        <input
          inputMode="decimal"
          onChange={(event) => onChange('freightValue', event.target.value)}
          value={draft.freightValue}
        />
      </label>
      <label>
        {t('creation.loadingPostalCode')}
        <input
          inputMode="numeric"
          maxLength={POSTAL_CODE_LENGTH}
          onChange={(event) => postalCode.loading.change(digitsOnly(event.target.value))}
          value={draft.loadingPostalCode}
        />
        {postalCode.loading.statusKey === null ? null : (
          <span className={styles.hint}>{t(postalCode.loading.statusKey)}</span>
        )}
      </label>
      <label>
        {t('creation.dischargePostalCode')}
        <input
          inputMode="numeric"
          maxLength={POSTAL_CODE_LENGTH}
          onChange={(event) => postalCode.discharge.change(digitsOnly(event.target.value))}
          value={draft.dischargePostalCode}
        />
        {postalCode.discharge.statusKey === null ? null : (
          <span className={styles.hint}>{t(postalCode.discharge.statusKey)}</span>
        )}
      </label>
      <label>
        {t('creation.insuranceEndorsement')}
        <input
          maxLength={ENDORSEMENT_MAX_LENGTH}
          onChange={(event) => onChange('insuranceEndorsement', event.target.value)}
          value={draft.insuranceEndorsement}
        />
      </label>
    </fieldset>
  )
}
