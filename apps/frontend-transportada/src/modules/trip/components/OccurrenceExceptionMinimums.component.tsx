/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'
import { OCCURRENCE_PHOTO_MINIMUM_COUNT } from '@/modules/trip/shared/occurrence.constant'
import {
  canEditExceptionItemsMinimum,
  type OccurrenceExceptionEdit,
  type OccurrenceExceptionEntry,
} from '@/modules/trip/shared/occurrenceException.service'
import { OCCURRENCE_ITEMS_MINIMUM_COUNT_MAX } from '@/modules/trip/shared/occurrenceRequirement.constant'
import styles from '@/modules/trip/styles/occurrenceException.module.css'

const INHERIT = 'inherit'
const ALL_ITEMS = 'all'
const AT_LEAST_ITEMS = 'atLeast'
const PHOTO_COUNTS = Array.from(
  { length: OCCURRENCE_PHOTO_MINIMUM_COUNT.max - OCCURRENCE_PHOTO_MINIMUM_COUNT.min + 1 },
  (_, index) => String(OCCURRENCE_PHOTO_MINIMUM_COUNT.min + index),
)

type OccurrenceExceptionMinimumsProps = Readonly<{
  disabled: boolean
  entry: OccurrenceExceptionEntry
  onEdit: (edit: OccurrenceExceptionEdit) => void
}>

/**
 * Spec 246 RF1c/RF1c2: os mínimos da exceção. O de produtos só existe com Produtos obrigatório declarado
 * na própria exceção (a API recusa o resto com 400) — fora disso o controle fica desligado, com o motivo à vista.
 */
export function OccurrenceExceptionMinimums({
  disabled,
  entry,
  onEdit,
}: OccurrenceExceptionMinimumsProps) {
  const { t } = useTranslation('companySettings')
  const reasonId = useId()
  const isItemsEditable = canEditExceptionItemsMinimum(entry)
  const itemsChoice =
    entry.itemsMinimumCount === null || entry.itemsMinimumCount === undefined
      ? ALL_ITEMS
      : AT_LEAST_ITEMS

  function handleItemsChoiceChange(choice: string) {
    onEdit({ itemsMinimumCount: choice === ALL_ITEMS ? null : (entry.itemsMinimumCount ?? 1) })
  }

  function handleItemsCountCommit(input: HTMLInputElement) {
    const count = Number(input.value)
    const isValid =
      Number.isInteger(count) && count >= 1 && count <= OCCURRENCE_ITEMS_MINIMUM_COUNT_MAX
    if (!isValid || count === entry.itemsMinimumCount) {
      input.value = String(entry.itemsMinimumCount ?? 1)
      return
    }
    onEdit({ itemsMinimumCount: count })
  }

  return (
    <>
      <div className={styles.field}>
        <span aria-hidden="true" className={styles.fieldLabel}>
          {t('occurrenceTypeCatalog.exceptions.photoMinimum')}
        </span>
        <Select
          ariaLabel={t('occurrenceTypeCatalog.exceptions.photoMinimum')}
          compact
          disabled={disabled}
          onChange={(value) =>
            onEdit({ photoMinimumCount: value === INHERIT ? null : Number(value) })
          }
          options={[
            { label: t('occurrenceTypeCatalog.exceptions.inheritMode'), value: INHERIT },
            ...PHOTO_COUNTS.map((value) => ({ label: value, value })),
          ]}
          value={
            entry.photoMinimumCount === null || entry.photoMinimumCount === undefined
              ? INHERIT
              : String(entry.photoMinimumCount)
          }
        />
      </div>
      <div
        aria-describedby={isItemsEditable ? undefined : reasonId}
        className={styles.field}
        role="group"
        aria-label={t('occurrenceTypeCatalog.exceptions.itemsMinimum')}
      >
        <span aria-hidden="true" className={styles.fieldLabel}>
          {t('occurrenceTypeCatalog.exceptions.itemsMinimum')}
        </span>
        <Select
          ariaLabel={t('occurrenceTypeCatalog.exceptions.itemsMinimum')}
          compact
          disabled={disabled || !isItemsEditable}
          onChange={handleItemsChoiceChange}
          options={[
            { label: t('occurrenceTypeCatalog.requirements.itemsMinimum.all'), value: ALL_ITEMS },
            {
              label: t('occurrenceTypeCatalog.requirements.itemsMinimum.atLeast'),
              value: AT_LEAST_ITEMS,
            },
          ]}
          placeholder={t('occurrenceTypeCatalog.exceptions.inheritMode')}
          value={isItemsEditable ? itemsChoice : ''}
        />
        {isItemsEditable &&
        entry.itemsMinimumCount !== null &&
        entry.itemsMinimumCount !== undefined ? (
          <input
            aria-label={t('occurrenceTypeCatalog.requirements.itemsMinimum.count')}
            className={styles.minimumInput}
            defaultValue={entry.itemsMinimumCount}
            disabled={disabled}
            key={entry.itemsMinimumCount}
            max={OCCURRENCE_ITEMS_MINIMUM_COUNT_MAX}
            min={1}
            onBlur={(event) => handleItemsCountCommit(event.currentTarget)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur()
            }}
            type="number"
          />
        ) : null}
        {isItemsEditable ? null : (
          <span className={styles.legend} id={reasonId}>
            {t('occurrenceTypeCatalog.exceptions.itemsMinimumBlocked')}
          </span>
        )}
      </div>
    </>
  )
}
