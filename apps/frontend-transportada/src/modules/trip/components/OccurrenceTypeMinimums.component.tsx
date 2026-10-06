/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'
import {
  OCCURRENCE_ATTACHMENT_MODE,
  OCCURRENCE_ITEMS_MODE,
  OCCURRENCE_PHOTO_MINIMUM_COUNT,
  type OccurrenceType,
} from '@/modules/trip/shared/occurrence.constant'
import { OCCURRENCE_ITEMS_MINIMUM_COUNT_MAX } from '@/modules/trip/shared/occurrenceRequirement.constant'
import type { OccurrenceTypeEdit } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import styles from '@/modules/trip/styles/occurrenceTypeRequirement.module.css'

const ALL_ITEMS = 'all'
const AT_LEAST_ITEMS = 'atLeast'
const PHOTO_COUNT_OPTIONS = Array.from(
  { length: OCCURRENCE_PHOTO_MINIMUM_COUNT.max - OCCURRENCE_PHOTO_MINIMUM_COUNT.min + 1 },
  (_, index) => String(OCCURRENCE_PHOTO_MINIMUM_COUNT.min + index),
)

type OccurrenceTypeMinimumsProps = Readonly<{
  disabled: boolean
  hasPhotoMinimum: boolean
  onEdit: (edit: OccurrenceTypeEdit) => void
  type: OccurrenceType
}>

/**
 * Spec 246 RF1c/RF1c2: as quantidades só aparecem quando o campo é obrigatório — a foto de 1 a 5, e
 * os produtos "todos os itens da nota" (nulo) ou ao menos N.
 */
export function OccurrenceTypeMinimums({
  disabled,
  hasPhotoMinimum,
  onEdit,
  type,
}: OccurrenceTypeMinimumsProps) {
  const { t } = useTranslation('companySettings')
  const isPhotoRequired =
    hasPhotoMinimum && type.attachmentMode === OCCURRENCE_ATTACHMENT_MODE.required
  const isItemsRequired =
    type.itemsMinimumCount !== undefined && type.itemsMode === OCCURRENCE_ITEMS_MODE.required
  const itemsChoice = type.itemsMinimumCount === null ? ALL_ITEMS : AT_LEAST_ITEMS

  function handleItemsChoiceChange(choice: string) {
    onEdit({ itemsMinimumCount: choice === ALL_ITEMS ? null : (type.itemsMinimumCount ?? 1) })
  }

  function handleItemsCountCommit(input: HTMLInputElement) {
    const count = Number(input.value)
    const isValid =
      Number.isInteger(count) && count >= 1 && count <= OCCURRENCE_ITEMS_MINIMUM_COUNT_MAX
    if (!isValid || count === type.itemsMinimumCount) {
      input.value = String(type.itemsMinimumCount ?? 1)
      return
    }
    onEdit({ itemsMinimumCount: count })
  }

  function handleItemsCountKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') event.currentTarget.blur()
  }

  return (
    <>
      {isPhotoRequired ? (
        <div className={styles.minimum}>
          <span>{t('occurrenceTypeCatalog.requirements.photoMinimum.label')}</span>
          <div className={styles.minimumControl}>
            <Select
              ariaLabel={t('occurrenceTypeCatalog.requirements.photoMinimum.label')}
              disabled={disabled}
              onChange={(value) => onEdit({ photoMinimumCount: Number(value) })}
              options={PHOTO_COUNT_OPTIONS.map((value) => ({ label: value, value }))}
              value={String(type.photoMinimumCount ?? OCCURRENCE_PHOTO_MINIMUM_COUNT.min)}
            />
          </div>
          <span className={styles.legend}>
            {t('occurrenceTypeCatalog.requirements.photoMinimum.hint')}
          </span>
        </div>
      ) : null}
      {isItemsRequired ? (
        <div className={styles.minimum}>
          <span>{t('occurrenceTypeCatalog.requirements.itemsMinimum.label')}</span>
          <div className={styles.minimumControl}>
            <Select
              ariaLabel={t('occurrenceTypeCatalog.requirements.itemsMinimum.label')}
              disabled={disabled}
              onChange={handleItemsChoiceChange}
              options={[
                {
                  label: t('occurrenceTypeCatalog.requirements.itemsMinimum.all'),
                  value: ALL_ITEMS,
                },
                {
                  label: t('occurrenceTypeCatalog.requirements.itemsMinimum.atLeast'),
                  value: AT_LEAST_ITEMS,
                },
              ]}
              value={itemsChoice}
            />
          </div>
          {type.itemsMinimumCount === null ? null : (
            <input
              aria-label={t('occurrenceTypeCatalog.requirements.itemsMinimum.count')}
              className={styles.minimumInput}
              defaultValue={type.itemsMinimumCount}
              disabled={disabled}
              key={type.itemsMinimumCount}
              max={OCCURRENCE_ITEMS_MINIMUM_COUNT_MAX}
              min={1}
              onBlur={(event) => handleItemsCountCommit(event.currentTarget)}
              onKeyDown={handleItemsCountKeyDown}
              type="number"
            />
          )}
          <span className={styles.legend}>
            {t('occurrenceTypeCatalog.requirements.itemsMinimum.hint')}
          </span>
        </div>
      ) : null}
    </>
  )
}
