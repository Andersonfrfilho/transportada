/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { buildHolidayWarningText } from '../shared/holidayWarningText.service'
import type { HolidayWarning } from '../shared/trip.types'
import styles from '../styles/tripHolidayWarning.module.css'

type AssemblyStopHolidayNoticeProps = Readonly<{
  /** A cidade como a lista da montagem a escreve ("Campinas/SP"): a rota de `day-checks` não devolve o nome. */
  placeLabel: string
  warning: HolidayWarning
}>

/**
 * Spec 252 T5.3 (ADR-0100 §6): o aviso de feriado dentro da parada da montagem — uma linha de texto neutro, com escopo,
 * nome e origem, que pede conferência. Só informa: sem botão, sem alerta que interrompe e sem relação com o "Criar
 * viagem", que nunca depende dele.
 */
export function AssemblyStopHolidayNotice({ placeLabel, warning }: AssemblyStopHolidayNoticeProps) {
  const { i18n, t } = useTranslation('trip')

  return (
    <p className={styles.notice} data-part="holiday-warning-notice">
      {buildHolidayWarningText({ language: i18n.language, placeLabel, t, warning })}
    </p>
  )
}
