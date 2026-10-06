/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import {
  OCCURRENCE_ATTACHMENT_MODE,
  TRIP_OCCURRENCE_STAGE,
  type OccurrenceAttachmentMode,
  type OccurrenceType,
} from '@/modules/trip/shared/occurrence.constant'
import { countExceptions } from '@/modules/trip/shared/occurrenceException.service'
import type { OccurrenceTypeExceptionsState } from '@/modules/trip/shared/occurrenceExceptionPeople.service'
import type { OccurrenceRequirementField } from '@/modules/trip/shared/occurrenceRequirement.constant'
import styles from '@/modules/trip/styles/occurrenceTypeItem.module.css'

type OccurrenceTypeSummaryProps = Readonly<{
  controlsId: string
  exceptions: OccurrenceTypeExceptionsState
  isExpanded: boolean
  onToggle: () => void
  type: OccurrenceType
}>

const NEED_CLASS_NAME: Readonly<Record<OccurrenceAttachmentMode, string | undefined>> = {
  off: styles.needOff,
  optional: styles.needOptional,
  required: styles.needRequired,
}

function readNeeds(
  type: OccurrenceType,
): readonly (readonly [OccurrenceRequirementField, OccurrenceAttachmentMode])[] {
  const isDelivery = type.stage === TRIP_OCCURRENCE_STAGE.delivery
  return [
    ...(isDelivery
      ? ([
          ['photo', type.attachmentMode],
          ['note', type.noteMode],
          ['signature', type.signatureMode],
        ] as const)
      : []),
    ...(type.itemsMode === undefined ? [] : ([['items', type.itemsMode]] as const)),
  ]
}

/** A linha fechada já diz o que importa sem abrir (RF11): momentos, as quatro exigências, aviso e exceções. */
export function OccurrenceTypeSummary({
  controlsId,
  exceptions,
  isExpanded,
  onToggle,
  type,
}: OccurrenceTypeSummaryProps) {
  const { t } = useTranslation('companySettings')
  const momentLabels = type.moments?.map((moment) =>
    t(`occurrenceTypeCatalog.moments.labels.${moment}`),
  ) ?? [
    t(
      type.stage === TRIP_OCCURRENCE_STAGE.delivery
        ? 'occurrenceTypeCatalog.stageDelivery'
        : 'occurrenceTypeCatalog.stageSeparation',
    ),
  ]
  const count = countExceptions(exceptions.overrides)
  const countLabel = (() => {
    if (exceptions.status === 'loading') return t('occurrenceTypeCatalog.summary.exceptionsLoading')
    if (exceptions.status === 'error')
      return t('occurrenceTypeCatalog.summary.exceptionsUnavailable')
    if (count === 0) return t('occurrenceTypeCatalog.summary.noExceptions')
    if (count === 1) return t('occurrenceTypeCatalog.summary.exceptionOne')
    return t('occurrenceTypeCatalog.summary.exceptionMany', { count })
  })()

  return (
    <button
      aria-controls={controlsId}
      aria-expanded={isExpanded}
      className={styles.summary}
      onClick={onToggle}
      type="button"
    >
      <span aria-hidden="true" className={styles.caret}>
        {isExpanded ? '▾' : '▸'}
      </span>
      <span className={styles.name}>{type.name}</span>
      {type.active ? null : (
        <span className={styles.tag}>{t('occurrenceTypeCatalog.summary.inactive')}</span>
      )}
      <span className={styles.tags}>
        {momentLabels.map((label) => (
          <span className={styles.tag} key={label}>
            {label}
          </span>
        ))}
      </span>
      <span className={styles.needs}>
        {readNeeds(type).map(([field, mode]) => (
          <span
            className={`${styles.need ?? ''} ${NEED_CLASS_NAME[mode] ?? ''}`}
            key={field}
            title={t(`occurrenceTypeCatalog.summary.needState.${mode}`, {
              field: t(`occurrenceTypeCatalog.requirements.fields.${field}`),
            })}
          >
            {field === 'photo' &&
            mode === OCCURRENCE_ATTACHMENT_MODE.required &&
            type.photoMinimumCount > 1
              ? t('occurrenceTypeCatalog.summary.needs.photoCount', {
                  count: type.photoMinimumCount,
                })
              : t(`occurrenceTypeCatalog.summary.needs.${field}`)}
          </span>
        ))}
      </span>
      {type.notifies ? (
        <span className={styles.notifies} title={t('occurrenceTypeCatalog.summary.notifies')}>
          ✉
        </span>
      ) : null}
      <span className={styles.count}>{countLabel}</span>
    </button>
  )
}
