/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useMemo, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'

import { Icon } from '@/components/ui/icon'

import { findBrazilianHoliday, listBrazilianHolidaysOfMonth } from './brazilianHoliday.service'
import {
  buildMonthCells,
  currentViewMonth,
  formatIsoDisplay,
  formatMonthTitle,
  isoToViewMonth,
  shiftViewMonth,
  toIsoDate,
  weekdayHeaders,
  type ViewMonth,
} from './calendar.service'
import { SELECT_TRIGGER_CLASS_NAMES } from './select'
import { useFloatingLayer } from './useFloatingLayer.hook'

import styles from './date-range-picker.module.css'

export type DateRangePickerProps = Readonly<{
  ariaLabel: string
  clearLabel: string
  from: string
  nextMonthLabel: string
  onChange: (from: string, to: string) => void
  placeholder: string
  previousMonthLabel: string
  to: string
}>

export function DateRangePicker({
  ariaLabel,
  clearLabel,
  from,
  nextMonthLabel,
  onChange,
  placeholder,
  previousMonthLabel,
  to,
}: DateRangePickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<ViewMonth>(isoToViewMonth(from) ?? currentViewMonth())
  const {
    anchorRef: rootRef,
    layerRef: calendarRef,
    layerStyle,
  } = useFloatingLayer<HTMLDivElement>({ isOpen: open, onDismiss: () => setOpen(false) })

  const headers = useMemo(() => weekdayHeaders(), [])
  const monthHolidays = useMemo(
    () => listBrazilianHolidaysOfMonth(view.year, view.month),
    [view.month, view.year],
  )
  const cells = useMemo(() => buildMonthCells(view), [view])

  function handleDayClick(day: number): void {
    const iso = toIsoDate(view.year, view.month, day)
    if (from.length === 0 || to.length > 0) {
      onChange(iso, '')
      return
    }
    if (iso < from) onChange(iso, from)
    else onChange(from, iso)
  }

  function isInRange(iso: string): boolean {
    if (from.length === 0) return false
    if (to.length === 0) return iso === from
    return iso >= from && iso <= to
  }

  const label =
    from.length === 0 && to.length === 0
      ? placeholder
      : `${from.length > 0 ? formatIsoDisplay(from) : '…'} – ${to.length > 0 ? formatIsoDisplay(to) : '…'}`

  return (
    <div className={styles.datePicker} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`${SELECT_TRIGGER_CLASS_NAMES.trigger ?? ''} ${SELECT_TRIGGER_CLASS_NAMES.triggerCompact ?? ''}`}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span
          className={
            from.length === 0 && to.length === 0
              ? (SELECT_TRIGGER_CLASS_NAMES.placeholder ?? '')
              : (SELECT_TRIGGER_CLASS_NAMES.value ?? '')
          }
        >
          {label}
        </span>
        <Icon className={SELECT_TRIGGER_CLASS_NAMES.chevron ?? ''} name="calendar" />
      </button>
      {open
        ? createPortal(
            <div className={styles.calendar} ref={calendarRef} style={layerStyle}>
              <div className={styles.calendarHeader}>
                <button
                  aria-label={previousMonthLabel}
                  className={styles.iconAction}
                  onClick={() => setView((current) => shiftViewMonth(current, -1))}
                  type="button"
                >
                  <Icon className={styles.actionIcon ?? ''} name="chevron-left" />
                </button>
                <span className={styles.calendarTitle}>{formatMonthTitle(view)}</span>
                <button
                  aria-label={nextMonthLabel}
                  className={styles.iconAction}
                  onClick={() => setView((current) => shiftViewMonth(current, 1))}
                  type="button"
                >
                  <Icon className={styles.actionIcon ?? ''} name="chevron-right" />
                </button>
              </div>
              <div className={styles.calendarGrid}>
                {headers.map((header) => (
                  <span className={styles.calendarWeekday} key={header}>
                    {header}
                  </span>
                ))}
                {cells.map((day, index) => {
                  if (day === null) {
                    return <span className={styles.calendarBlank} key={`blank-${String(index)}`} />
                  }
                  const iso = toIsoDate(view.year, view.month, day)
                  const active = isInRange(iso)
                  const edge = iso === from || iso === to
                  const holiday = findBrazilianHoliday(iso)
                  return (
                    <button
                      aria-pressed={active}
                      className={[
                        styles.calendarDay ?? '',
                        active ? (styles.calendarDayInRange ?? '') : '',
                        edge ? (styles.calendarDayEdge ?? '') : '',
                        holiday === undefined ? '' : (styles.calendarDayHoliday ?? ''),
                      ]
                        .filter((name) => name.length > 0)
                        .join(' ')}
                      key={iso}
                      onClick={() => handleDayClick(day)}
                      title={holiday}
                      type="button"
                    >
                      {day}
                    </button>
                  )
                })}
              </div>
              {monthHolidays.length === 0 ? null : (
                <ul className={styles.calendarHolidays}>
                  {monthHolidays.map((holiday) => (
                    <li className={styles.calendarHoliday} key={holiday.date}>
                      <span className={styles.calendarHolidayDay}>{holiday.date.slice(8)}</span>
                      {holiday.name}
                    </li>
                  ))}
                </ul>
              )}
              <div className={styles.calendarFooter}>
                <button
                  className={styles.calendarClear}
                  onClick={() => {
                    onChange('', '')
                    setOpen(false)
                  }}
                  type="button"
                >
                  {clearLabel}
                </button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
