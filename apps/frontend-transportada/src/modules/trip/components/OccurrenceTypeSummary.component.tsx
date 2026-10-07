/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import {
  OCCURRENCE_ATTACHMENT_MODE,
  type OccurrenceAttachmentMode,
  type OccurrenceType,
} from '@/modules/trip/shared/occurrence.constant'
import { resolveOccurrenceMoments } from '@/modules/trip/shared/occurrenceMoments.service'
import { countExceptions } from '@/modules/trip/shared/occurrenceException.service'
import type { OccurrenceTypeExceptionsState } from '@/modules/trip/shared/occurrenceExceptionPeople.service'
import type { OccurrenceRequirementField } from '@/modules/trip/shared/occurrenceRequirement.constant'
import {
  readOccurrenceRequirementMode,
  readOccurrenceRequirementScope,
} from '@/modules/trip/shared/occurrenceRequirementScope.service'
import styles from '@/modules/trip/styles/occurrenceTypeItem.module.css'

import { buildOccurrenceTypeSummaryId } from '../hooks/useOccurrenceTypeJustCreated.hook'

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
  return readOccurrenceRequirementScope(type).typeFields.map((field) => [
    field,
    readOccurrenceRequirementMode(type, field),
  ])
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
  const momentLabels = resolveOccurrenceMoments(type).map((moment) =>
    t(`occurrenceTypeCatalog.moments.labels.${moment}`),
  )
  const count = countExceptions(exceptions.overrides)
  const photoCount = type.photoMinimumCount ?? 1
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
      id={buildOccurrenceTypeSummaryId(type.id)}
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
          <span className={`${styles.need ?? ''} ${NEED_CLASS_NAME[mode] ?? ''}`} key={field}>
            {field === 'photo' && mode === OCCURRENCE_ATTACHMENT_MODE.required && photoCount > 1
              ? t('occurrenceTypeCatalog.summary.needs.photoCount', { count: photoCount })
              : t(`occurrenceTypeCatalog.summary.needs.${field}`)}
            <span className={styles.srOnly}>
              {': '}
              {t(`occurrenceTypeCatalog.requirements.modes.${mode}`)}
            </span>
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
