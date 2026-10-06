/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { MultiSelect } from '@/components/ui/multi-select'
import { Tooltip } from '@/components/ui/tooltip'
import {
  OCCURRENCE_MOMENTS,
  type OccurrenceMoment,
} from '@/modules/trip/shared/occurrence.constant'
import {
  readOccurrenceMomentsProblem,
  toOccurrenceMoments,
  type OccurrenceMomentsProblem,
} from '@/modules/trip/shared/occurrenceMoments.service'
import type { OccurrenceTypeEdit } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import styles from '@/modules/trip/styles/occurrenceException.module.css'

type OccurrenceTypeMomentsProps = Readonly<{
  disabled: boolean
  moments: readonly OccurrenceMoment[]
  onEdit: (edit: OccurrenceTypeEdit) => void
}>

type RejectedDraft = Readonly<{
  moments: readonly OccurrenceMoment[]
  problem: OccurrenceMomentsProblem
}>

/**
 * Spec 246 RF0/RF1h/T5.3b: o conjunto de momentos do tipo. Conjunto vazio (ou nota e parada juntas) é
 * recusado aqui, com o motivo à vista — a API recusa o mesmo e a tela não precisa esperar por ela.
 */
export function OccurrenceTypeMoments({ disabled, moments, onEdit }: OccurrenceTypeMomentsProps) {
  const { t } = useTranslation('companySettings')
  const [rejected, setRejected] = useState<null | RejectedDraft>(null)
  const shown = rejected?.moments ?? moments

  function handleChange(values: readonly string[]) {
    const next = toOccurrenceMoments(values)
    const problem = readOccurrenceMomentsProblem(next)
    if (problem !== null) {
      setRejected({ moments: next, problem })
      return
    }
    setRejected(null)
    onEdit({ moments: next })
  }

  return (
    <section aria-label={t('occurrenceTypeCatalog.moments.title')} className={styles.block}>
      <p className={styles.title}>{t('occurrenceTypeCatalog.moments.title')}</p>
      <Tooltip dismissOnActivate label={t('occurrenceTypeCatalog.moments.note')}>
        <MultiSelect
          ariaLabel={t('occurrenceTypeCatalog.moments.title')}
          clearAllLabel={t('occurrenceTypeCatalog.moments.clearAll')}
          disabled={disabled}
          emptyLabel={t('occurrenceTypeCatalog.moments.empty')}
          onChange={handleChange}
          options={OCCURRENCE_MOMENTS.map((moment) => ({
            label: t(`occurrenceTypeCatalog.moments.labels.${moment}`),
            value: moment,
          }))}
          placeholder={t('occurrenceTypeCatalog.moments.placeholder')}
          removeLabel={t('occurrenceTypeCatalog.moments.remove')}
          searchPlaceholder={t('occurrenceTypeCatalog.moments.searchPlaceholder')}
          summaryLabel={(count) => t('occurrenceTypeCatalog.moments.summary', { count })}
          values={shown}
        />
      </Tooltip>
      {rejected === null ? null : (
        <p className={styles.alert} role="alert">
          {t(`occurrenceTypeCatalog.moments.problem.${rejected.problem}`)}
        </p>
      )}
      <p className={styles.legend}>{t('occurrenceTypeCatalog.moments.note')}</p>
    </section>
  )
}
