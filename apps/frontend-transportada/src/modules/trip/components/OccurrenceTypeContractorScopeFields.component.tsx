/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { MultiSelect, type MultiSelectOption } from '@/components/ui/multi-select'
import { Select } from '@/components/ui/select'
import {
  OCCURRENCE_TYPE_CONTRACTOR_SCOPE,
  type OccurrenceMoment,
  type OccurrenceTypeContractorScope,
} from '@/modules/trip/shared/occurrence.constant'
import {
  isStopOnly,
  type ContractorScopeProblem,
} from '@/modules/trip/shared/occurrenceTypeContractorScope.service'
import styles from '@/modules/trip/styles/occurrenceException.module.css'

export type ContractorScopeChange = Readonly<{
  ids: readonly string[]
  scope: OccurrenceTypeContractorScope
}>

type OccurrenceTypeContractorScopeFieldsProps = Readonly<{
  contractorIds: readonly string[]
  disabled: boolean
  isTruncated: boolean
  moments: readonly OccurrenceMoment[]
  onChange: (change: ContractorScopeChange) => void
  options: readonly MultiSelectOption[]
  problem: ContractorScopeProblem | null
  scope: OccurrenceTypeContractorScope
}>

/**
 * Spec 270 RF1/RF2/RF5: o "Vale para" — escolha entre todas as contratantes e só algumas, e o seletor múltiplo
 * das cadastradas (nome e CNPJ). Tipo só de parada fica travado em "Todas": a parada não tem contratante.
 * Sem estado próprio: o editor do tipo aberto e o cadastro do tipo novo guardam o rascunho cada um à sua maneira.
 */
export function OccurrenceTypeContractorScopeFields({
  contractorIds,
  disabled,
  isTruncated,
  moments,
  onChange,
  options,
  problem,
  scope,
}: OccurrenceTypeContractorScopeFieldsProps) {
  const { t } = useTranslation('companySettings')
  const isLocked = isStopOnly(moments)
  const isListed = !isLocked && scope === OCCURRENCE_TYPE_CONTRACTOR_SCOPE.listed

  function handleScopeChange(value: string) {
    const next =
      value === OCCURRENCE_TYPE_CONTRACTOR_SCOPE.listed
        ? OCCURRENCE_TYPE_CONTRACTOR_SCOPE.listed
        : OCCURRENCE_TYPE_CONTRACTOR_SCOPE.all
    onChange({
      ids: next === OCCURRENCE_TYPE_CONTRACTOR_SCOPE.all ? [] : contractorIds,
      scope: next,
    })
  }

  return (
    <>
      <Select
        ariaLabel={t('occurrenceTypeCatalog.contractorScope.title')}
        disabled={disabled || isLocked}
        onChange={handleScopeChange}
        options={[
          {
            label: t('occurrenceTypeCatalog.contractorScope.options.all'),
            value: OCCURRENCE_TYPE_CONTRACTOR_SCOPE.all,
          },
          {
            label: t('occurrenceTypeCatalog.contractorScope.options.listed'),
            value: OCCURRENCE_TYPE_CONTRACTOR_SCOPE.listed,
          },
        ]}
        value={isLocked ? OCCURRENCE_TYPE_CONTRACTOR_SCOPE.all : scope}
      />
      {isListed ? (
        <MultiSelect
          ariaLabel={t('occurrenceTypeCatalog.contractorScope.pickerLabel')}
          clearAllLabel={t('occurrenceTypeCatalog.contractorScope.clearAll')}
          disabled={disabled}
          emptyLabel={t('occurrenceTypeCatalog.contractorScope.empty')}
          onChange={(ids) => onChange({ ids, scope })}
          options={options}
          placeholder={t('occurrenceTypeCatalog.contractorScope.placeholder')}
          removeLabel={(label) => t('occurrenceTypeCatalog.contractorScope.remove', { label })}
          searchPlaceholder={t('occurrenceTypeCatalog.contractorScope.searchPlaceholder')}
          summaryLabel={(count) => t('occurrenceTypeCatalog.contractorScope.summary', { count })}
          values={contractorIds}
        />
      ) : null}
      {isListed && isTruncated ? (
        <p className={styles.legend}>{t('occurrenceTypeCatalog.contractorScope.truncated')}</p>
      ) : null}
      {isLocked ? (
        <p className={styles.legend}>{t('occurrenceTypeCatalog.contractorScope.stopOnly')}</p>
      ) : null}
      {!isLocked && moments.includes('stop') ? (
        <p className={styles.legend}>
          {t('occurrenceTypeCatalog.contractorScope.stopAllContractors')}
        </p>
      ) : null}
      {problem === null ? null : (
        <p className={styles.alert} role="alert">
          {t(`occurrenceTypeCatalog.contractorScope.problem.${problem}`)}
        </p>
      )}
    </>
  )
}
