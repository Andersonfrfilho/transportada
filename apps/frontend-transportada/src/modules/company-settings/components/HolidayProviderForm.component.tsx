/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Icon } from '@/components/ui/icon'

import type { HolidayProviderActions } from '../hooks/useHolidayProviderActions.hook'
import { focusBusinessCalendarField } from '../shared/focusBusinessCalendarField.service'
import { HOLIDAY_PROVIDER_FIELD } from '../shared/holidayProviderSettings.constant'
import {
  buildHolidayProviderSubmission,
  toInitialHolidayProviderDraft,
  type HolidayProviderField,
} from '../shared/holidayProviderSettingsForm.service'
import type { HolidayProviderSettings } from '../shared/holidayProviderSettings.types'
import businessCalendarStyles from '../styles/businessCalendar.module.css'

import { HolidayProviderFeedback } from './HolidayProviderFeedback.component'
import { HolidayProviderInput } from './HolidayProviderInput.component'
import { HolidayProviderRemoval } from './HolidayProviderRemoval.component'

type HolidayProviderFormProps = Readonly<{
  actions: HolidayProviderActions
  settings: HolidayProviderSettings
}>

/**
 * O formulário da chave e do orçamento. O pai o remonta (`key` = versão) quando a configuração muda: é isso que o faz
 * abrir sempre sem a chave e com o orçamento gravado. A chave digitada é limpa assim que o pedido sai, certo ou errado
 * — o campo nunca a devolve; só a recusa LOCAL (formato) deixa o texto, porque ele nem saiu do navegador.
 */
export function HolidayProviderForm({ actions, settings }: HolidayProviderFormProps) {
  const { t } = useTranslation('businessCalendar')
  const formReference = useRef<HTMLFormElement>(null)
  const [draft, setDraft] = useState(() => toInitialHolidayProviderDraft(settings))
  const [blocked, setBlocked] = useState<readonly HolidayProviderField[]>([])
  const [hasNothingToSave, setHasNothingToSave] = useState(false)
  const hasToken = settings.tokenConfigured

  function focusField(field: string): void {
    focusBusinessCalendarField({ field, panel: formReference.current })
  }

  function edit(field: HolidayProviderField, value: string): void {
    actions.dismissFeedback()
    setHasNothingToSave(false)
    setBlocked((current) => current.filter((candidate) => candidate !== field))
    setDraft((current) =>
      field === HOLIDAY_PROVIDER_FIELD.TOKEN
        ? { ...current, token: value }
        : { ...current, budget: value },
    )
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const submission = buildHolidayProviderSubmission({ draft, settings })
    setHasNothingToSave(submission.status === 'unchanged')
    setBlocked(submission.status === 'blocked' ? submission.fields : [])
    if (submission.status === 'blocked') {
      const [first] = submission.fields
      if (first !== undefined) focusField(first)
    }
    if (submission.status !== 'ready') return
    const refusedField = await actions.save(submission.body)
    setDraft((current) => ({ ...current, token: '' }))
    if (refusedField !== undefined) focusField(refusedField)
  }

  const issueOf = (field: HolidayProviderField): string | undefined =>
    blocked.includes(field) ? t(`providerSettings.errors.${field}`) : undefined
  const tokenKey = hasToken ? 'providerSettings.form.token.replace' : 'providerSettings.form.token'

  return (
    <form
      className={businessCalendarStyles.form}
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
      ref={formReference}
    >
      <div className={businessCalendarStyles.fieldGrid}>
        <HolidayProviderInput
          control={{
            autoComplete: 'off',
            onChange: (value) => edit(HOLIDAY_PROVIDER_FIELD.TOKEN, value),
            spellCheck: false,
            type: 'password',
            value: draft.token,
          }}
          field={HOLIDAY_PROVIDER_FIELD.TOKEN}
          hint={t(`${tokenKey}.hint`)}
          issueText={issueOf(HOLIDAY_PROVIDER_FIELD.TOKEN)}
          label={t(`${tokenKey}.label`)}
        />
        <HolidayProviderInput
          control={{
            autoComplete: 'off',
            inputMode: 'numeric',
            onChange: (value) => edit(HOLIDAY_PROVIDER_FIELD.BUDGET, value),
            placeholder: t('providerSettings.form.budget.placeholder', {
              value: settings.monthlyRequestBudget,
            }),
            type: 'text',
            value: draft.budget,
          }}
          field={HOLIDAY_PROVIDER_FIELD.BUDGET}
          hint={t('providerSettings.form.budget.hint')}
          issueText={issueOf(HOLIDAY_PROVIDER_FIELD.BUDGET)}
          label={t('providerSettings.form.budget.label')}
        />
      </div>
      <div className={businessCalendarStyles.actions}>
        <Button disabled={actions.isSaving} type="submit">
          <Icon name="save" />
          {actions.isSaving ? t('providerSettings.form.saving') : t('providerSettings.form.save')}
        </Button>
        {settings.budgetOrigin === 'installation' ? (
          <Button
            onClick={() => edit(HOLIDAY_PROVIDER_FIELD.BUDGET, '')}
            type="button"
            variant="ghost"
          >
            {t('providerSettings.form.budget.useDefault')}
          </Button>
        ) : null}
        {hasToken ? <HolidayProviderRemoval actions={actions} /> : null}
      </div>
      {hasNothingToSave ? (
        <p className={businessCalendarStyles.hint} role="status">
          {t('providerSettings.form.unchanged')}
        </p>
      ) : null}
      <HolidayProviderFeedback actions={actions} onShortcut={focusField} />
    </form>
  )
}
