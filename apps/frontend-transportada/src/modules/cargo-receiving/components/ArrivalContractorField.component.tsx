/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { SearchableSelect } from '@/components/ui/searchable-select'

import type { EnabledContractors } from '../queries/useCargoContractors.query'
import type { CargoFormIssue } from '../shared/cargoArrivalForm.validation'
import styles from '../styles/cargoReceiving.module.css'

type ArrivalContractorFieldProps = Readonly<{
  contractors: EnabledContractors
  issue: CargoFormIssue | undefined
  onChange: (contractorId: string) => void
  value: string
}>

/** Só o contratante com o recebimento ligado entra na lista, e a ajuda diz por quê. */
export function ArrivalContractorField({
  contractors,
  issue,
  onChange,
  value,
}: ArrivalContractorFieldProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')

  return (
    <div className={styles.fieldGroup} data-field="contractorId" tabIndex={-1}>
      <span>{t('register.contractor')}</span>
      <SearchableSelect
        ariaLabel={t('register.contractor')}
        disabled={contractors.isLoading}
        emptyLabel={t('register.contractorEmpty')}
        onChange={onChange}
        options={contractors.contractors.map((contractor) => ({
          label: contractor.displayName,
          value: contractor.id,
        }))}
        placeholder={
          contractors.isLoading
            ? t('register.contractorsLoading')
            : t('register.contractorPlaceholder')
        }
        searchPlaceholder={t('register.contractorSearch')}
        value={value}
      />
      <p className={styles.hint}>{t('register.contractorHint')}</p>
      {issue === undefined ? null : (
        <p className={styles.error} role="alert">
          {t(`issues.${issue.code}`)}
        </p>
      )}
    </div>
  )
}
