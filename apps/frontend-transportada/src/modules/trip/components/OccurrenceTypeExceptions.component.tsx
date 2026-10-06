/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Skeleton, SkeletonGroup } from '@/components/ui/skeleton'

import type {
  OccurrenceAttachmentMode,
  OccurrenceAttachmentOverrides,
} from '@/modules/trip/shared/occurrence.constant'
import {
  addException,
  countExceptions,
  editException,
  removeException,
  toExceptionKey,
  type OccurrenceExceptionEdit,
  type OccurrenceExceptionKey,
} from '@/modules/trip/shared/occurrenceException.service'
import {
  describeExceptionKey,
  type OccurrenceTypeExceptionsState,
} from '@/modules/trip/shared/occurrenceExceptionPeople.service'
import { useReplaceOccurrenceAttachmentOverridesMutation } from '@/modules/trip/queries/useOccurrenceAttachmentOverrides.query'
import styles from '@/modules/trip/styles/occurrenceException.module.css'

import { OccurrenceExceptionForm } from './OccurrenceExceptionForm.component'
import { OccurrenceExceptionItem } from './OccurrenceExceptionItem.component'

type OccurrenceTypeExceptionsProps = Readonly<{
  canManage: boolean
  exceptions: OccurrenceTypeExceptionsState
  isDisabled: boolean
  occurrenceTypeId: string
  typeAttachmentMode: OccurrenceAttachmentMode
}>

/**
 * Spec 246 RF11/RF11c: as exceções do tipo à vista, lidas da consulta em lote (uma por tela). A gravação
 * é o `PUT` que substitui as duas listas do tipo — por isso cada edição manda o conjunto inteiro.
 */
export function OccurrenceTypeExceptions({
  canManage,
  exceptions,
  isDisabled,
  occurrenceTypeId,
  typeAttachmentMode,
}: OccurrenceTypeExceptionsProps) {
  const { t } = useTranslation('companySettings')
  const replaceMutation = useReplaceOccurrenceAttachmentOverridesMutation()
  const overrides = exceptions.overrides
  const isLocked = isDisabled || !canManage || replaceMutation.isPending
  const count = countExceptions(overrides)

  function save(next: OccurrenceAttachmentOverrides) {
    replaceMutation.mutate({ ...next, occurrenceTypeId })
  }

  function handleEdit(key: OccurrenceExceptionKey, edit: OccurrenceExceptionEdit) {
    if (overrides !== undefined) save(editException(overrides, key, edit))
  }

  function handleRemove(key: OccurrenceExceptionKey) {
    if (overrides !== undefined) save(removeException(overrides, key))
  }

  function handleAdd(
    input: Readonly<{ attachmentMode: OccurrenceAttachmentMode; key: OccurrenceExceptionKey }>,
  ) {
    if (overrides !== undefined) save(addException(overrides, input))
  }

  if (exceptions.status === 'error') {
    return (
      <section className={styles.block}>
        <p className={styles.title}>{t('occurrenceTypeCatalog.exceptions.title')}</p>
        <p className={styles.alert} role="alert">
          {t('occurrenceTypeCatalog.exceptions.failed')}
        </p>
      </section>
    )
  }

  const entries = [
    ...(overrides?.contractorOverrides ?? []),
    ...(overrides?.recipientOverrides ?? []),
  ]
  const usedValues = entries.map((entry) => {
    const key = toExceptionKey(entry)
    return key.kind === 'contractor' ? key.contractorId : key.taxId
  })

  return (
    <section aria-label={t('occurrenceTypeCatalog.exceptions.title')} className={styles.block}>
      <p className={styles.title}>{t('occurrenceTypeCatalog.exceptions.titleCount', { count })}</p>
      <p className={styles.legend}>{t('occurrenceTypeCatalog.exceptions.intro')}</p>
      {canManage ? null : (
        <p className={styles.legend}>{t('occurrenceTypeCatalog.exceptions.readOnly')}</p>
      )}
      {overrides === undefined ? (
        <SkeletonGroup label={t('occurrenceTypeCatalog.exceptions.loading')}>
          <Skeleton height="2.5rem" />
        </SkeletonGroup>
      ) : null}
      {overrides !== undefined && count === 0 ? (
        <p className={styles.legend}>{t('occurrenceTypeCatalog.exceptions.empty')}</p>
      ) : null}
      <ul className={styles.list}>
        {entries.map((entry) => {
          const key = toExceptionKey(entry)
          return (
            <OccurrenceExceptionItem
              disabled={isLocked}
              entry={entry}
              key={'contractorId' in entry ? `c:${entry.contractorId}` : `r:${entry.taxId}`}
              onEdit={handleEdit}
              onRemove={handleRemove}
              subject={describeExceptionKey(key, exceptions.people)}
            />
          )
        })}
      </ul>
      {canManage && overrides !== undefined ? (
        <OccurrenceExceptionForm
          disabled={isLocked}
          onAdd={handleAdd}
          people={exceptions.people}
          typeAttachmentMode={typeAttachmentMode}
          usedValues={usedValues}
        />
      ) : null}
    </section>
  )
}
