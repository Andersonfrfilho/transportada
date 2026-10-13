/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useTranslation } from 'react-i18next'

import { Select } from '@/components/ui/select'
import {
  FORWARD_EMAIL_BODY_MAX_LENGTH,
  FORWARD_EMAIL_SUBJECT_MAX_LENGTH,
  INFORMED_EMAIL_FORWARD_MODES,
  NOTE_RECIPIENT_FORWARD_MODES,
  type InformedEmailForwardMode,
  type NoteRecipientForwardMode,
} from '@/modules/trip/shared/occurrenceContractorReply.constant'
import {
  isForwardOn,
  type ContractorReplyDraft,
  type ContractorReplyProblems,
} from '@/modules/trip/shared/occurrenceContractorReplyDraft.service'
import styles from '@/modules/trip/styles/occurrenceTypeMail.module.css'

type OccurrenceTypeContractorReplyForwardProps = Readonly<{
  baseId: string
  disabled: boolean
  draft: ContractorReplyDraft
  onChange: (patch: Partial<ContractorReplyDraft>) => void
  problems: ContractorReplyProblems
}>

/**
 * Spec 248 RF10/RF11 (T4.7): o boleto levado a um terceiro por e-mail — ao cliente da nota e a um endereço
 * que o operador informa. As duas escolhas compartilham o assunto e o corpo, e a CHECK do banco exige os
 * dois textos assim que qualquer uma sai de "não enviar"; a recusa aparece no campo, antes do `PUT`.
 */
export function OccurrenceTypeContractorReplyForward({
  baseId,
  disabled,
  draft,
  onChange,
  problems,
}: OccurrenceTypeContractorReplyForwardProps) {
  const { t } = useTranslation('companySettings')
  const prefix = 'occurrenceTypeCatalog.contractorReply'

  function problemText(field: keyof ContractorReplyProblems): string {
    const code = problems[field]
    return code === undefined ? '' : t(`${prefix}.problems.${code}`)
  }

  function renderAlert(field: keyof ContractorReplyProblems) {
    const text = problemText(field)
    if (text === '') return null
    return (
      <p className={styles.alert} id={`${baseId}-${field}`} role="alert">
        {text}
      </p>
    )
  }

  function renderText(input: {
    field: 'forwardEmailBody' | 'forwardEmailSubject'
    isMultiline: boolean
    maxLength: number
  }) {
    const message = problemText(input.field)
    const shared = {
      'aria-describedby': message === '' ? undefined : `${baseId}-${input.field}`,
      'aria-invalid': message !== '',
      disabled,
      maxLength: input.maxLength,
      onChange: (event: { target: { value: string } }) =>
        onChange({ [input.field]: event.target.value }),
      value: draft[input.field],
    }
    return (
      <label className={styles.field}>
        <span className={styles.fieldLabel}>{t(`${prefix}.fields.${input.field}`)}</span>
        {input.isMultiline ? <textarea {...shared} /> : <input {...shared} />}
        {renderAlert(input.field)}
      </label>
    )
  }

  return (
    <>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t(`${prefix}.fields.forwardToNoteRecipient`)}</span>
        <Select
          ariaLabel={t(`${prefix}.fields.forwardToNoteRecipient`)}
          disabled={disabled}
          onChange={(value) =>
            onChange({ forwardToNoteRecipient: value as NoteRecipientForwardMode })
          }
          options={NOTE_RECIPIENT_FORWARD_MODES.map((option) => ({
            label: t(`${prefix}.forwardToNoteRecipient.${option}`),
            value: option,
          }))}
          value={draft.forwardToNoteRecipient}
        />
        {renderAlert('forwardToNoteRecipient')}
      </div>
      <div className={styles.field}>
        <span className={styles.fieldLabel}>{t(`${prefix}.fields.forwardToInformedEmail`)}</span>
        <Select
          ariaLabel={t(`${prefix}.fields.forwardToInformedEmail`)}
          disabled={disabled}
          onChange={(value) =>
            onChange({ forwardToInformedEmail: value as InformedEmailForwardMode })
          }
          options={INFORMED_EMAIL_FORWARD_MODES.map((option) => ({
            label: t(`${prefix}.forwardToInformedEmail.${option}`),
            value: option,
          }))}
          value={draft.forwardToInformedEmail}
        />
      </div>
      {isForwardOn(draft) ? (
        <>
          <p className={styles.hint}>{t(`${prefix}.forwardLegend`)}</p>
          {renderText({
            field: 'forwardEmailSubject',
            isMultiline: false,
            maxLength: FORWARD_EMAIL_SUBJECT_MAX_LENGTH,
          })}
          {renderText({
            field: 'forwardEmailBody',
            isMultiline: true,
            maxLength: FORWARD_EMAIL_BODY_MAX_LENGTH,
          })}
        </>
      ) : null}
    </>
  )
}
