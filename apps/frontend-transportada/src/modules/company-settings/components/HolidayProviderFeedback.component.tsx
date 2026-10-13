/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import type { HolidayProviderActions } from '../hooks/useHolidayProviderActions.hook'
import { focusOnMount } from '../shared/focusOnMount.service'
import businessCalendarStyles from '../styles/businessCalendar.module.css'

import { HolidayRefusal } from './HolidayRefusal.component'

type HolidayProviderFeedbackProps = Readonly<{
  actions: HolidayProviderActions
  onShortcut: (field: string) => void
}>

/**
 * O resultado da última gravação: "salvo" e "removida" são avisos discretos (`role="status"`), a recusa é um alerta que
 * nomeia o campo e o leva ao foco. Só um dos três aparece por vez — cada gravação limpa o resultado anterior. O formulário
 * remonta quando a versão muda e o botão que tinha o foco some: o aviso de "salvo" e de "removida" recebe o foco ao
 * aparecer, para o foco não cair no `body`.
 */
export function HolidayProviderFeedback({ actions, onShortcut }: HolidayProviderFeedbackProps) {
  const { t } = useTranslation('businessCalendar')

  return (
    <>
      {actions.isSaved ? (
        <p className={businessCalendarStyles.status} ref={focusOnMount} role="status" tabIndex={-1}>
          {t('providerSettings.form.saved')}
        </p>
      ) : null}
      {actions.isRemoved ? (
        <p className={businessCalendarStyles.status} ref={focusOnMount} role="status" tabIndex={-1}>
          {t('providerSettings.remove.removed')}
        </p>
      ) : null}
      {actions.refusal === undefined ? null : (
        <HolidayRefusal onShortcut={onShortcut} refusal={actions.refusal} />
      )}
    </>
  )
}
