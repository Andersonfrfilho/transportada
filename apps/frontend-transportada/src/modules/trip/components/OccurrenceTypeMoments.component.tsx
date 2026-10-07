/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'
import { MultiSelect } from '@/components/ui/multi-select'
import { Tooltip } from '@/components/ui/tooltip'
import {
  OCCURRENCE_MOMENTS,
  type OccurrenceMoment,
} from '@/modules/trip/shared/occurrence.constant'
import {
  readOccurrenceMomentsProblem,
  toOccurrenceMoments,
} from '@/modules/trip/shared/occurrenceMoments.service'
import type { OccurrenceTypeEdit } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import styles from '@/modules/trip/styles/occurrenceException.module.css'

type OccurrenceTypeMomentsProps = Readonly<{
  disabled: boolean
  moments: readonly OccurrenceMoment[]
  onEdit: (edit: OccurrenceTypeEdit) => void
}>

function isSameMoments(
  left: readonly OccurrenceMoment[],
  right: readonly OccurrenceMoment[],
): boolean {
  return left.length === right.length && left.every((moment, index) => moment === right[index])
}

/**
 * Spec 246 RF0/RF1h/T5.3b: o conjunto de momentos do tipo, editado como **rascunho**: cada toque
 * muda só a seleção, e o "Aplicar" grava uma vez — sem fechar o seletor a cada toque nem mover o
 * tipo de grupo no meio da escolha. Conjunto vazio (ou nota e parada juntas) é recusado aqui, com o
 * motivo à vista; "Desfazer" volta ao gravado.
 */
export function OccurrenceTypeMoments({ disabled, moments, onEdit }: OccurrenceTypeMomentsProps) {
  const { t } = useTranslation('companySettings')
  const [draft, setDraft] = useState<null | readonly OccurrenceMoment[]>(null)
  const pending = draft !== null && !isSameMoments(draft, moments) ? draft : null
  const shown = pending ?? moments
  const problem = pending === null ? null : readOccurrenceMomentsProblem(pending)

  function handleChange(values: readonly string[]) {
    setDraft(toOccurrenceMoments(values))
  }

  function handleApply() {
    if (pending === null || problem !== null) return
    onEdit({ moments: pending })
  }

  function handleUndo() {
    setDraft(null)
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
          removeLabel={(label) => t('occurrenceTypeCatalog.moments.remove', { label })}
          searchPlaceholder={t('occurrenceTypeCatalog.moments.searchPlaceholder')}
          summaryLabel={(count) => t('occurrenceTypeCatalog.moments.summary', { count })}
          values={shown}
        />
      </Tooltip>
      {problem === null ? null : (
        <p className={styles.alert} role="alert">
          {t(`occurrenceTypeCatalog.moments.problem.${problem}`)}
        </p>
      )}
      {pending === null ? null : (
        <div className={styles.momentActions}>
          <Button
            disabled={disabled || problem !== null}
            onClick={handleApply}
            size="sm"
            type="button"
          >
            <Icon name="check" />
            {t('occurrenceTypeCatalog.moments.apply')}
          </Button>
          <Button onClick={handleUndo} size="sm" type="button" variant="ghost">
            <Icon name="close" />
            {t('occurrenceTypeCatalog.moments.undo')}
          </Button>
        </div>
      )}
      <p className={styles.legend}>{t('occurrenceTypeCatalog.moments.note')}</p>
    </section>
  )
}
