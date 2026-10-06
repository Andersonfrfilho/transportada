/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { JSX } from 'react'
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'
import { useMomentFormatter } from '@/modules/shared/useMomentFormatter.hook'

import type { CargoOccurrenceView } from '../shared/cargoOccurrence.types'
import styles from '../styles/cargoOccurrence.module.css'

type CargoReturnOriginSelectProps = Readonly<{
  occurrenceId: string
  occurrences: readonly CargoOccurrenceView[]
  onChange: (occurrenceId: string) => void
}>

/** A avaria que motiva a devolução: a tratativa e o motivo ficam ligados a ela. */
export function CargoReturnOriginSelect({
  occurrenceId,
  occurrences,
  onChange,
}: CargoReturnOriginSelectProps): JSX.Element {
  const { t } = useTranslation('cargoReceiving')
  const formatMoment = useMomentFormatter()

  return (
    <div className={styles.fieldGroup}>
      <span className={styles.fieldTitle}>{t('occurrence.mark.originLabel')}</span>
      <Select
        ariaLabel={t('occurrence.mark.originLabel')}
        onChange={onChange}
        options={occurrences.map((item) => ({
          label: t('occurrence.mark.originOption', {
            moment: formatMoment(item.createdAt),
            type: item.typeName,
          }),
          value: item.id,
        }))}
        value={occurrenceId}
      />
    </div>
  )
}
