/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { MultiSelect } from '@/components/ui/multi-select'
import { Tooltip } from '@/components/ui/tooltip'
import {
  OCCURRENCE_MOMENTS,
  type OccurrenceMoment,
} from '@/modules/trip/shared/occurrence.constant'
import {
  toOccurrenceMoments,
  type OccurrenceMomentsProblem,
} from '@/modules/trip/shared/occurrenceMoments.service'
import styles from '@/modules/trip/styles/occurrenceException.module.css'

import { OccurrenceTypeMomentHints } from './OccurrenceTypeMomentHints.component'

type OccurrenceTypeCreateMomentsProps = Readonly<{
  moments: readonly OccurrenceMoment[]
  onChange: (moments: readonly OccurrenceMoment[]) => void
  problem: null | OccurrenceMomentsProblem
}>

/** Os momentos do tipo novo: sem rascunho, porque nada foi gravado ainda — o botão Cadastrar é quem recusa. */
export function OccurrenceTypeCreateMoments({
  moments,
  onChange,
  problem,
}: OccurrenceTypeCreateMomentsProps) {
  const { t } = useTranslation('companySettings')

  return (
    <div className={styles.block}>
      <Tooltip dismissOnActivate fill label={t('occurrenceTypeCatalog.moments.note')}>
        <MultiSelect
          ariaLabel={t('occurrenceTypeCatalog.moments.title')}
          clearAllLabel={t('occurrenceTypeCatalog.moments.clearAll')}
          emptyLabel={t('occurrenceTypeCatalog.moments.empty')}
          onChange={(values) => onChange(toOccurrenceMoments(values))}
          options={OCCURRENCE_MOMENTS.map((moment) => ({
            label: t(`occurrenceTypeCatalog.moments.labels.${moment}`),
            value: moment,
          }))}
          placeholder={t('occurrenceTypeCatalog.moments.placeholder')}
          removeLabel={(label) => t('occurrenceTypeCatalog.moments.remove', { label })}
          searchPlaceholder={t('occurrenceTypeCatalog.moments.searchPlaceholder')}
          summaryLabel={(count) => t('occurrenceTypeCatalog.moments.summary', { count })}
          values={moments}
        />
      </Tooltip>
      <OccurrenceTypeMomentHints />
      {problem === null ? null : (
        <p className={styles.alert} role="alert">
          {t(`occurrenceTypeCatalog.moments.problem.${problem}`)}
        </p>
      )}
    </div>
  )
}
