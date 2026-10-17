/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import type {
  OccurrenceMoment,
  OccurrenceTypeContractor,
  OccurrenceTypeContractorScope,
} from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceExceptionPeople } from '@/modules/trip/shared/occurrenceExceptionPeople.service'
import {
  buildContractorScopeOptions,
  readContractorScopeProblem,
} from '@/modules/trip/shared/occurrenceTypeContractorScope.service'
import type { OccurrenceTypeEdit } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import styles from '@/modules/trip/styles/occurrenceException.module.css'

import {
  OccurrenceTypeContractorScopeFields,
  type ContractorScopeChange,
} from './OccurrenceTypeContractorScopeFields.component'

type OccurrenceTypeContractorScopeProps = Readonly<{
  contractors: readonly OccurrenceTypeContractor[]
  disabled: boolean
  moments: readonly OccurrenceMoment[]
  onEdit: (edit: OccurrenceTypeEdit) => void
  people: OccurrenceExceptionPeople
  scope: OccurrenceTypeContractorScope
}>

function isSameIds(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((id) => right.includes(id))
}

/**
 * Spec 270 RF1/RF2/RF10: o "Vale para" do tipo aberto. É rascunho com "Aplicar", como os momentos: a lista só
 * é gravada inteira, nunca a cada toque — e a recusa (lista vazia, tipo só de parada) aparece antes de gravar.
 */
export function OccurrenceTypeContractorScope({
  contractors,
  disabled,
  moments,
  onEdit,
  people,
  scope,
}: OccurrenceTypeContractorScopeProps) {
  const { t } = useTranslation('companySettings')
  const [draft, setDraft] = useState<ContractorScopeChange | null>(null)
  const storedIds = contractors.map((contractor) => contractor.id)
  const shown: ContractorScopeChange = draft ?? { ids: storedIds, scope }
  const isPending = draft !== null && (draft.scope !== scope || !isSameIds(draft.ids, storedIds))
  const problem = isPending
    ? readContractorScopeProblem({ contractorIds: shown.ids, moments, scope: shown.scope })
    : null

  function handleApply() {
    if (!isPending || problem !== null) return
    setDraft(null)
    onEdit({ contractorIds: shown.ids, contractorScope: shown.scope })
  }

  return (
    <section aria-label={t('occurrenceTypeCatalog.contractorScope.title')} className={styles.block}>
      <p className={styles.title}>{t('occurrenceTypeCatalog.contractorScope.title')}</p>
      <OccurrenceTypeContractorScopeFields
        contractorIds={shown.ids}
        disabled={disabled}
        isTruncated={people.contractorsTruncated}
        moments={moments}
        onChange={setDraft}
        options={buildContractorScopeOptions({
          contractors: people.contractors,
          labels: { inactive: t('occurrenceTypeCatalog.contractorScope.inactive') },
          selected: contractors,
        })}
        problem={problem}
        scope={shown.scope}
      />
      {isPending ? (
        <p aria-live="polite" className={styles.pendingNotice} role="status">
          {t('occurrenceTypeCatalog.contractorScope.pending')}
        </p>
      ) : null}
      {isPending ? (
        <div className={styles.momentActions}>
          <Button
            disabled={disabled || problem !== null}
            onClick={handleApply}
            size="sm"
            type="button"
          >
            <Icon name="check" />
            {t('occurrenceTypeCatalog.contractorScope.apply')}
          </Button>
          <Button onClick={() => setDraft(null)} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('occurrenceTypeCatalog.contractorScope.undo')}
          </Button>
        </div>
      ) : null}
      <p className={styles.legend}>{t('occurrenceTypeCatalog.contractorScope.note')}</p>
    </section>
  )
}
