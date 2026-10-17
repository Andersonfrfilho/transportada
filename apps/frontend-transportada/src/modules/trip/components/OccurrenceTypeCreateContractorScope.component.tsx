/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import type {
  OccurrenceMoment,
  OccurrenceTypeContractorScope,
} from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceExceptionPeople } from '@/modules/trip/shared/occurrenceExceptionPeople.service'
import {
  buildContractorScopeOptions,
  type ContractorScopeProblem,
} from '@/modules/trip/shared/occurrenceTypeContractorScope.service'
import styles from '@/modules/trip/styles/occurrenceException.module.css'

import {
  OccurrenceTypeContractorScopeFields,
  type ContractorScopeChange,
} from './OccurrenceTypeContractorScopeFields.component'

type OccurrenceTypeCreateContractorScopeProps = Readonly<{
  contractorIds: readonly string[]
  moments: readonly OccurrenceMoment[]
  onChange: (change: ContractorScopeChange) => void
  people: OccurrenceExceptionPeople
  problem: ContractorScopeProblem | null
  scope: OccurrenceTypeContractorScope
}>

/** O "Vale para" do tipo novo: sem rascunho nem Aplicar — nada foi gravado ainda, e o botão Cadastrar é quem recusa. */
export function OccurrenceTypeCreateContractorScope({
  contractorIds,
  moments,
  onChange,
  people,
  problem,
  scope,
}: OccurrenceTypeCreateContractorScopeProps) {
  const { t } = useTranslation('companySettings')

  return (
    <div className={styles.block}>
      <p className={styles.title}>{t('occurrenceTypeCatalog.contractorScope.title')}</p>
      <OccurrenceTypeContractorScopeFields
        contractorIds={contractorIds}
        disabled={false}
        isTruncated={people.contractorsTruncated}
        moments={moments}
        onChange={onChange}
        options={buildContractorScopeOptions({
          contractors: people.contractors,
          labels: { inactive: t('occurrenceTypeCatalog.contractorScope.inactive') },
          selected: [],
        })}
        problem={problem}
        scope={scope}
      />
    </div>
  )
}
