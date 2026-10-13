/**
 * Copyright (c) 2026 Ada Technology. MIT License.
 */
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon, type IconName } from '@/components/ui/icon'
import { Select } from '@/components/ui/select'
import { OccurrenceTypeContractorReplyForward } from '@/modules/trip/components/OccurrenceTypeContractorReplyForward.component'
import {
  CONTRACTOR_REPLY_ALERT_MODES,
  CONTRACTOR_REPLY_ATTACHMENT_KINDS,
  CONTRACTOR_REPLY_MODES,
} from '@/modules/trip/shared/occurrenceContractorReply.constant'
import {
  buildContractorReplyEdit,
  hasContractorReplyProblems,
  isContractorReplyDraftChanged,
  readContractorReplyDraft,
  readContractorReplyProblems,
  type ContractorReplyDraft,
  type ContractorReplyProblems,
} from '@/modules/trip/shared/occurrenceContractorReplyDraft.service'
import type { OccurrenceType } from '@/modules/trip/shared/occurrence.constant'
import type { OccurrenceTypeEdit } from '@/modules/trip/shared/occurrenceTypeUpdate.service'
import itemStyles from '@/modules/trip/styles/occurrenceTypeItem.module.css'
import styles from '@/modules/trip/styles/occurrenceTypeMail.module.css'

type OccurrenceTypeContractorReplyProps = Readonly<{
  disabled: boolean
  onEdit: (edit: OccurrenceTypeEdit) => void
  type: OccurrenceType
}>

type NumberFieldName = 'alertIntervalMinutes' | 'alertMaxCount' | 'waitHours'

/** Um símbolo por campo: o olho acha o que procura antes de ler a frase (web.md §9). */
const FIELD_ICON: Readonly<Record<string, IconName>> = {
  alertIntervalMinutes: 'refresh',
  alertMaxCount: 'alert',
  alertMode: 'alert',
  attachmentKind: 'document',
  driverReplyTemplate: 'message',
  mode: 'send',
  waitHours: 'clock',
}

/**
 * Spec 248 RF1/T5.1: o que fazer quando a contratante responde ao pedido (adiantamento ou prorrogação de
 * boleto). O conjunto é rascunho e vai de uma vez no "Salvar retorno": as CHECKs do banco avaliam os campos
 * juntos, então cada recusa aparece **no campo** antes do `PUT`.
 */
export function OccurrenceTypeContractorReply({
  disabled,
  onEdit,
  type,
}: OccurrenceTypeContractorReplyProps) {
  const { t } = useTranslation('companySettings')
  const baseId = useId()
  const saved = readContractorReplyDraft(type)
  const [draft, setDraft] = useState<ContractorReplyDraft>(saved)
  const isChanged = isContractorReplyDraftChanged(draft, saved)
  const problems = readContractorReplyProblems({
    draft,
    emailsContractor: type.emailsContractor === true,
  })
  const isBlocked = hasContractorReplyProblems(problems)
  const isReplyOn = draft.mode !== 'off'
  const isAlertOn = draft.alertMode !== 'off'

  function change(patch: Partial<ContractorReplyDraft>) {
    setDraft((current) => ({ ...current, ...patch }))
  }

  function problemText(field: keyof ContractorReplyProblems): string {
    const code = problems[field]
    return code === undefined ? '' : t(`occurrenceTypeCatalog.contractorReply.problems.${code}`)
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

  function renderSelect<TValue extends string>(input: {
    field: keyof ContractorReplyProblems | null
    label: string
    onChange: (value: TValue) => void
    optionKey: string
    options: readonly TValue[]
    value: TValue
  }) {
    return (
      <div className={styles.field}>
        <span className={styles.fieldLabel}>
          <Icon name={FIELD_ICON[input.optionKey] ?? 'document'} size="sm" />
          {input.label}
        </span>
        <Select
          ariaLabel={input.label}
          disabled={disabled}
          onChange={(value) => input.onChange(value as TValue)}
          options={input.options.map((option) => ({
            label: t(`occurrenceTypeCatalog.contractorReply.${input.optionKey}.${option}`),
            value: option,
          }))}
          value={input.value}
        />
        {input.field === null ? null : renderAlert(input.field)}
      </div>
    )
  }

  function renderNumber(field: NumberFieldName) {
    const message = problemText(field)
    return (
      <label className={styles.field}>
        <span className={styles.fieldLabel}>
          <Icon name={FIELD_ICON[field] ?? 'document'} size="sm" />
          {t(`occurrenceTypeCatalog.contractorReply.fields.${field}`)}
        </span>
        <input
          aria-describedby={message === '' ? undefined : `${baseId}-${field}`}
          aria-invalid={message !== ''}
          className={message === '' ? '' : (styles.invalid ?? '')}
          disabled={disabled}
          inputMode="numeric"
          onChange={(event) => change({ [field]: event.target.value })}
          value={draft[field]}
        />
        {renderAlert(field)}
      </label>
    )
  }

  function handleSave() {
    if (!isChanged || isBlocked) return
    onEdit(buildContractorReplyEdit(draft))
  }

  return (
    <section aria-label={t('occurrenceTypeCatalog.contractorReply.title')} className={styles.mail}>
      <p className={itemStyles.blockTitle}>
        <Icon name="invoice" size="sm" />
        {t('occurrenceTypeCatalog.contractorReply.title')}
      </p>
      <p className={styles.hint}>{t('occurrenceTypeCatalog.contractorReply.legend')}</p>
      <div className={styles.fields}>
        {renderSelect({
          field: 'mode',
          label: t('occurrenceTypeCatalog.contractorReply.fields.mode'),
          onChange: (mode) => change({ mode }),
          optionKey: 'mode',
          options: CONTRACTOR_REPLY_MODES,
          value: draft.mode,
        })}
        {isReplyOn ? (
          <>
            {renderSelect({
              field: null,
              label: t('occurrenceTypeCatalog.contractorReply.fields.attachmentKind'),
              onChange: (attachmentKind) => change({ attachmentKind }),
              optionKey: 'attachmentKind',
              options: CONTRACTOR_REPLY_ATTACHMENT_KINDS,
              value: draft.attachmentKind,
            })}
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                <Icon name={FIELD_ICON.driverReplyTemplate ?? 'message'} size="sm" />
                {t('occurrenceTypeCatalog.contractorReply.fields.driverReplyTemplate')}
              </span>
              <textarea
                aria-describedby={
                  problemText('driverReplyTemplate') === ''
                    ? undefined
                    : `${baseId}-driverReplyTemplate`
                }
                aria-invalid={problemText('driverReplyTemplate') !== ''}
                disabled={disabled}
                onChange={(event) => change({ driverReplyTemplate: event.target.value })}
                value={draft.driverReplyTemplate}
              />
              {renderAlert('driverReplyTemplate')}
            </label>
          </>
        ) : null}
        {renderNumber('waitHours')}
        {renderSelect({
          field: null,
          label: t('occurrenceTypeCatalog.contractorReply.fields.alertMode'),
          onChange: (alertMode) => change({ alertMode }),
          optionKey: 'alertMode',
          options: CONTRACTOR_REPLY_ALERT_MODES,
          value: draft.alertMode,
        })}
        {isAlertOn ? (
          <>
            {renderNumber('alertIntervalMinutes')}
            {renderNumber('alertMaxCount')}
          </>
        ) : null}
        <OccurrenceTypeContractorReplyForward
          baseId={baseId}
          disabled={disabled}
          draft={draft}
          onChange={change}
          problems={problems}
        />
        <div className={styles.actions}>
          <Button
            className={styles.action}
            disabled={disabled || !isChanged || isBlocked}
            onClick={handleSave}
            size="sm"
            type="button"
          >
            <Icon name="check" />
            {t('occurrenceTypeCatalog.contractorReply.save')}
          </Button>
          {isChanged ? (
            <Button
              className={styles.action}
              onClick={() => setDraft(saved)}
              size="sm"
              type="button"
              variant="ghost"
            >
              <Icon name="close" />
              {t('occurrenceTypeCatalog.contractorReply.undo')}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  )
}
