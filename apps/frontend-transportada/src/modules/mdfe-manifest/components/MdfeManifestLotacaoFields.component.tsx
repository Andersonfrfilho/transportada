/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

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
const TAX_ID_MAX_LENGTH = 14

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

export function MdfeManifestLotacaoFields({ draft, onChange }: MdfeManifestLotacaoFieldsProps) {
  const { t } = useTranslation('mdfeManifest')
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
          inputMode="numeric"
          maxLength={TAX_ID_MAX_LENGTH}
          onChange={(event) => onChange('contractorTaxId', digitsOnly(event.target.value))}
          value={draft.contractorTaxId}
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
          onChange={(event) => onChange('loadingPostalCode', digitsOnly(event.target.value))}
          value={draft.loadingPostalCode}
        />
      </label>
      <label>
        {t('creation.dischargePostalCode')}
        <input
          inputMode="numeric"
          maxLength={POSTAL_CODE_LENGTH}
          onChange={(event) => onChange('dischargePostalCode', digitsOnly(event.target.value))}
          value={draft.dischargePostalCode}
        />
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
