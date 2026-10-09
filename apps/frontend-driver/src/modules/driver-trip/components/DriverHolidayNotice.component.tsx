/* Copyright (c) 2026 Ada Technology. MIT License. */
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'

import { Icon } from '@/components/ui/icon'

import type { HolidayReason, HolidayWarning } from '../shared/driverTrip.types'
import {
  HOLIDAY_SCOPE,
  NATIONAL_HOLIDAY_KEYS,
  type NationalHolidayKey,
} from '../shared/holidayWarning.constant'
import { listHolidayNoticeLines, type HolidayNoticeLine } from '../shared/holidayWarning.service'
import styles from '../styles/holidayNotice.module.css'

type DriverHolidayNoticeProps = Readonly<{
  nowMs: number
  warnings: readonly HolidayWarning[] | undefined
}>

function isNationalHolidayKey(name: string): name is NationalHolidayKey {
  return (NATIONAL_HOLIDAY_KEYS as readonly string[]).includes(name)
}

function resolveScopeLabel(scope: string, t: TFunction<'driverTrip'>): string {
  if (scope === HOLIDAY_SCOPE.NATIONAL) return t('holidayWarning.scope.national')
  if (scope === HOLIDAY_SCOPE.STATE) return t('holidayWarning.scope.state')
  if (scope === HOLIDAY_SCOPE.MUNICIPAL) return t('holidayWarning.scope.municipal')
  return t('holidayWarning.scope.other')
}

/** Nacional chega como chave estável (o texto é do locale); estadual e municipal chegam com o nome pronto. */
function resolveReasonLabel(reason: HolidayReason, t: TFunction<'driverTrip'>): string {
  if (reason.scope === HOLIDAY_SCOPE.NATIONAL && isNationalHolidayKey(reason.name)) {
    return t(`holidayWarning.national.${reason.name}`)
  }
  const name = reason.scope === HOLIDAY_SCOPE.NATIONAL ? '' : reason.name.trim()
  return name === '' ? resolveScopeLabel(reason.scope, t) : name
}

function resolveLineText(line: HolidayNoticeLine, t: TFunction<'driverTrip'>): string {
  const reasons = line.reasons.map((reason) => resolveReasonLabel(reason, t)).join(', ')
  const values = { city: line.cityName, date: line.dateLabel, reasons }
  if (line.isToday) {
    return line.cityName === undefined
      ? t('holidayWarning.todayWithoutCity', values)
      : t('holidayWarning.today', values)
  }
  return line.cityName === undefined
    ? t('holidayWarning.futureWithoutCity', values)
    : t('holidayWarning.future', values)
}

/**
 * Spec 252 (RF14, CA15, CA17): o feriado na cidade da parada, só para o motorista conferir. Texto neutro,
 * sem toque e sem foco — nunca esconde nem trava iniciar rota, chegar, entregar ou registrar ocorrência.
 */
export function DriverHolidayNotice({ nowMs, warnings }: DriverHolidayNoticeProps) {
  const { t } = useTranslation('driverTrip')
  const lines = listHolidayNoticeLines({ nowMs, warnings })
  if (lines.length === 0) return null

  return (
    <aside aria-label={t('holidayWarning.label')} className={styles.holidayNotice}>
      <ul className={styles.holidayNoticeList}>
        {lines.map((line) => (
          <li className={styles.holidayNoticeLine} key={`${line.dateLabel}-${line.cityName ?? ''}`}>
            <Icon aria-hidden="true" name="alert" size="sm" />
            <span>{resolveLineText(line, t)}</span>
          </li>
        ))}
      </ul>
    </aside>
  )
}
