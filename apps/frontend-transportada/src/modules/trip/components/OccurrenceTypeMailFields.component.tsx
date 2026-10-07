/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useId, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'

import {
  OCCURRENCE_MAIL_CONTEXT,
  OCCURRENCE_MAIL_MAX_LENGTH,
  type OccurrenceMailContext,
} from '@/modules/trip/shared/occurrenceMailTemplate.constant'
import {
  OCCURRENCE_MAIL_DRAFT_KEY,
  type OccurrenceMailDraft,
  type OccurrenceMailProblems,
} from '@/modules/trip/shared/occurrenceMailDraft.service'
import styles from '@/modules/trip/styles/occurrenceTypeMail.module.css'

export type OccurrenceMailFieldElement = HTMLInputElement | HTMLTextAreaElement

type OccurrenceTypeMailFieldsProps = Readonly<{
  disabled: boolean
  draft: OccurrenceMailDraft
  fieldRefs: RefObject<Partial<Record<OccurrenceMailContext, OccurrenceMailFieldElement | null>>>
  onChange: (context: OccurrenceMailContext, text: string) => void
  onFocus: (context: OccurrenceMailContext) => void
  problems: OccurrenceMailProblems
}>

const FIELD_ORDER = [
  OCCURRENCE_MAIL_CONTEXT.subject,
  OCCURRENCE_MAIL_CONTEXT.body,
  OCCURRENCE_MAIL_CONTEXT.itemLine,
] as const

/**
 * Spec 247 RF3/RF5: assunto, corpo e a linha de cada produto. Marcador desconhecido aparece **no próprio
 * campo** (`aria-invalid` + aviso ligado por `aria-describedby`), nomeando o marcador.
 */
export function OccurrenceTypeMailFields({
  disabled,
  draft,
  fieldRefs,
  onChange,
  onFocus,
  problems,
}: OccurrenceTypeMailFieldsProps) {
  const { t } = useTranslation('companySettings')
  const baseId = useId()

  return (
    <>
      {FIELD_ORDER.map((context) => {
        const label = t(`occurrenceTypeCatalog.mail.fields.${context}`)
        const names = problems[context]
        const alertId = `${baseId}-${context}`
        const shared = {
          'aria-describedby': names.length > 0 ? alertId : undefined,
          'aria-invalid': names.length > 0,
          'aria-label': label,
          className: `${styles.mono ?? ''} ${names.length > 0 ? (styles.invalid ?? '') : ''}`,
          disabled,
          maxLength: OCCURRENCE_MAIL_MAX_LENGTH[context],
          onFocus: () => onFocus(context),
          value: draft[OCCURRENCE_MAIL_DRAFT_KEY[context]],
        }
        return (
          <label className={styles.field} key={context}>
            <span className={styles.fieldLabel}>{label}</span>
            {context === OCCURRENCE_MAIL_CONTEXT.body ? (
              <textarea
                {...shared}
                onChange={(event) => onChange(context, event.target.value)}
                ref={(element) => {
                  fieldRefs.current[context] = element
                }}
              />
            ) : (
              <input
                {...shared}
                onChange={(event) => onChange(context, event.target.value)}
                ref={(element) => {
                  fieldRefs.current[context] = element
                }}
                type="text"
              />
            )}
            {names.length > 0 ? (
              <p className={styles.alert} id={alertId} role="alert">
                {t('occurrenceTypeCatalog.mail.unknownMarker', {
                  count: names.length,
                  markers: names.map((name) => `{{${name}}}`).join(', '),
                })}
              </p>
            ) : null}
          </label>
        )
      })}
    </>
  )
}
