/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { MultiSelect } from '@/components/ui/multi-select'
import { Select } from '@/components/ui/select'

import {
  OCCURRENCE_WHOLE_DOCUMENT_VALUE,
  resolveOccurrenceProductSelection,
  resolveOccurrenceProductSelectionValues,
} from '../shared/occurrenceProductSelection.service'
import type { TripDocumentProduct } from '../shared/trip.types'
import styles from '../styles/trip.module.css'

export type OccurrenceProductSelectProps = Readonly<{
  allowsMultipleItems: boolean
  onChange: (productCodes: readonly string[]) => void
  productCodes: readonly string[]
  products: readonly TripDocumentProduct[]
}>

/**
 * O seletor de itens da nota que o registro e a correção da ocorrência dividem. Uma ocorrência
 * aponta vários itens; "a nota inteira" é o padrão e é exclusiva — a regra mora em
 * `resolveOccurrenceProductSelection`. Tipo de item único vira seleção única (spec 166 RF8).
 */
export function OccurrenceProductSelect({
  allowsMultipleItems,
  onChange,
  productCodes,
  products,
}: OccurrenceProductSelectProps) {
  const { t } = useTranslation('trip')
  const options = [
    { label: t('occurrence.wholeDocument'), value: OCCURRENCE_WHOLE_DOCUMENT_VALUE },
    ...products.map((product) => ({
      description: product.description,
      label: product.code,
      value: product.code,
    })),
  ]

  return (
    <label>
      <span>{t('occurrence.product')}</span>
      {allowsMultipleItems ? (
        <MultiSelect
          ariaLabel={t('occurrence.product')}
          clearAllLabel={t('occurrence.productClear')}
          emptyLabel={t('occurrence.productEmpty')}
          onChange={(next) =>
            onChange(
              resolveOccurrenceProductSelection({
                next,
                previous: resolveOccurrenceProductSelectionValues(productCodes),
              }),
            )
          }
          options={options}
          placeholder={t('occurrence.wholeDocument')}
          removeLabel={t('occurrence.productRemove')}
          searchPlaceholder={t('occurrence.productSearch')}
          summaryLabel={(count) => t('occurrence.productSummary', { count })}
          values={resolveOccurrenceProductSelectionValues(productCodes)}
        />
      ) : (
        <Select
          ariaLabel={t('occurrence.product')}
          onChange={(next) => onChange(next === OCCURRENCE_WHOLE_DOCUMENT_VALUE ? [] : [next])}
          options={options}
          value={productCodes[0] ?? OCCURRENCE_WHOLE_DOCUMENT_VALUE}
        />
      )}
      {allowsMultipleItems ? null : (
        <span className={styles.hint}>{t('occurrence.singleItemHint')}</span>
      )}
    </label>
  )
}
