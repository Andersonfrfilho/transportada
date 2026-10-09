/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useTranslation } from 'react-i18next'

import { Tooltip } from '@/components/ui/tooltip'

import {
  buildHolidayBadgeLabel,
  buildHolidayWarningText,
} from '../shared/holidayWarningText.service'
import type { HolidayWarning } from '../shared/trip.types'
import styles from '../styles/tripHolidayWarning.module.css'

type TripStopHolidayBadgeProps = Readonly<{ warnings: readonly HolidayWarning[] }>

/**
 * Spec 252 T5.3: o selo de feriado na parada do detalhe da viagem, no molde do selo do prazo (236). O dia fica no selo; a
 * frase inteira vai na dica do design system e, para o leitor de tela, dentro do próprio selo — nunca só na cor. Não é
 * botão, não leva foco e não muda ação nem ordem de nenhuma parada.
 */
export function TripStopHolidayBadge({ warnings }: TripStopHolidayBadgeProps) {
  const { i18n, t } = useTranslation('trip')

  return (
    <>
      {warnings.map((warning) => {
        const text = buildHolidayWarningText({ language: i18n.language, t, warning })
        return (
          <Tooltip key={`${String(warning.cityIbgeCode)}:${warning.date}`} label={text}>
            <span className={styles.badge} data-part="holiday-warning" data-tone="warning">
              <span data-part="holiday-warning-label">
                {buildHolidayBadgeLabel({ language: i18n.language, t, warning })}
              </span>
              <span className={styles.visuallyHidden} data-part="holiday-warning-text">
                {`, ${text}`}
              </span>
            </span>
          </Tooltip>
        )
      })}
    </>
  )
}
