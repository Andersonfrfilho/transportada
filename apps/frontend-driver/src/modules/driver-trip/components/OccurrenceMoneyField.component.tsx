/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { isMoneyInputAtLimit } from '../shared/occurrenceMoneyMask.service'
import { OccurrenceTextField } from './OccurrenceTextField.component'

type OccurrenceMoneyFieldProps = Readonly<{
  label: string
  /** Recebe o texto cru do campo; quem guarda aplica a máscara (`maskMoneyInput`). */
  onChange: (text: string) => void
  placeholder: string
  /** O texto já mascarado (`1.234,56`) ou vazio. */
  value: string
}>

/**
 * Spec 247 (T7.2, A3): o campo do valor pago com a máscara de centavos do painel — só dígito entra, o eco
 * é imediato e, no teto, a tela diz que a próxima tecla não cabe em vez de ignorá-la calada.
 */
export function OccurrenceMoneyField({
  label,
  onChange,
  placeholder,
  value,
}: OccurrenceMoneyFieldProps) {
  const { t } = useTranslation('driverTrip')
  const liveMessage = isMoneyInputAtLimit(value)
    ? t('occurrenceRegistration.declaredAmount.limit')
    : ''

  return (
    <OccurrenceTextField
      inputMode="numeric"
      label={label}
      liveMessage={liveMessage}
      onChange={onChange}
      placeholder={placeholder}
      value={value}
    />
  )
}
