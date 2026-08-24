/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'
import { createPortal } from 'react-dom'

import { Icon } from '@/components/ui/icon'

import { findBrazilianHoliday, listBrazilianHolidaysOfMonth } from './brazilianHoliday.service'
import {
  buildMonthCells,
  buildYearChoices,
  currentViewMonth,
  formatMonthTitle,
  isoToDisplayDate,
  isoToViewMonth,
  maskTypedDate,
  parseDisplayDate,
  shiftViewMonth,
  toIsoDate,
  weekdayHeaders,
  type ViewMonth,
} from './calendar.service'
import { SELECT_TRIGGER_CLASS_NAMES } from './select'
import { useFloatingLayer } from './useFloatingLayer.hook'

import styles from './date-range-picker.module.css'

export type DatePickerProps = Readonly<{
  ariaLabel: string
  chooseYearLabel: string
  /** Alinha a altura com um `Select compact` ao lado — sem isto os dois campos ficam desencontrados. */
  compact?: boolean
  clearLabel: string
  nextMonthLabel: string
  onChange: (value: string) => void
  openCalendarLabel: string
  placeholder: string
  previousMonthLabel: string
  value: string
}>

/**
 * A data se digita e o ano se escolhe: data de nascimento fica a mais de quatrocentos cliques do
 * mês de hoje, e navegar mês a mês até 1985 não é caminho que alguém percorre.
 */
export function DatePicker({
  ariaLabel,
  chooseYearLabel,
  clearLabel,
  compact,
  nextMonthLabel,
  onChange,
  openCalendarLabel,
  placeholder,
  previousMonthLabel,
  value,
}: DatePickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [showYears, setShowYears] = useState(false)
  const [draft, setDraft] = useState<string | null>(null)
  const [view, setView] = useState<ViewMonth>(isoToViewMonth(value) ?? currentViewMonth())
  const selectedYearRef = useRef<HTMLButtonElement | null>(null)
  const {
    anchorRef: rootRef,
    layerRef: calendarRef,
    layerStyle,
  } = useFloatingLayer<HTMLDivElement>({
    isOpen: open,
    onDismiss: () => {
      setOpen(false)
      setShowYears(false)
    },
  })

  const headers = useMemo(() => weekdayHeaders(), [])
  const years = useMemo(() => buildYearChoices(), [])
  const monthHolidays = useMemo(
    () => listBrazilianHolidaysOfMonth(view.year, view.month),
    [view.month, view.year],
  )
  const cells = useMemo(() => buildMonthCells(view), [view])

  useEffect(() => {
    if (showYears) selectedYearRef.current?.scrollIntoView({ block: 'center' })
  }, [showYears])

  function handleDayClick(day: number): void {
    const iso = toIsoDate(view.year, view.month, day)
    onChange(iso)
    setDraft(null)
    setOpen(false)
    setShowYears(false)
  }

  function handleTyping(typed: string): void {
    const masked = maskTypedDate(typed)
    setDraft(masked)
    if (masked.length === 0) {
      onChange('')
      return
    }
    const iso = parseDisplayDate(masked)
    if (iso === null) return
    onChange(iso)
    const nextView = isoToViewMonth(iso)
    if (nextView !== null) setView(nextView)
  }

  return (
    <div className={styles.datePicker} ref={rootRef}>
      <div
        className={[
          SELECT_TRIGGER_CLASS_NAMES.trigger ?? '',
          compact === true ? (SELECT_TRIGGER_CLASS_NAMES.triggerCompact ?? '') : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <input
          aria-label={ariaLabel}
          className={styles.dateInput}
          inputMode="numeric"
          maxLength={10}
          onBlur={() => setDraft(null)}
          onChange={(event) => handleTyping(event.target.value)}
          placeholder={placeholder}
          value={draft ?? isoToDisplayDate(value)}
        />
        <button
          aria-expanded={open}
          aria-label={openCalendarLabel}
          className={styles.dateInputAction}
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          <Icon className={styles.actionIcon ?? ''} name="calendar" />
        </button>
      </div>
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
                <button
                  aria-expanded={showYears}
                  aria-label={chooseYearLabel}
                  className={styles.calendarTitleAction}
                  onClick={() => setShowYears((current) => !current)}
                  type="button"
                >
                  <span className={styles.calendarTitle}>{formatMonthTitle(view)}</span>
                  <Icon className={styles.actionIcon ?? ''} name="chevron-down" />
                </button>
                <button
                  aria-label={nextMonthLabel}
                  className={styles.iconAction}
                  onClick={() => setView((current) => shiftViewMonth(current, 1))}
                  type="button"
                >
                  <Icon className={styles.actionIcon ?? ''} name="chevron-right" />
                </button>
              </div>
              {showYears ? (
                <div className={styles.yearGrid}>
                  {years.map((year) => {
                    const selected = year === view.year
                    return (
                      <button
                        aria-pressed={selected}
                        className={[
                          styles.yearOption ?? '',
                          selected ? (styles.yearOptionSelected ?? '') : '',
                        ]
                          .filter((name) => name.length > 0)
                          .join(' ')}
                        key={year}
                        onClick={() => {
                          setView((current) => ({ month: current.month, year }))
                          setShowYears(false)
                        }}
                        ref={selected ? selectedYearRef : null}
                        type="button"
                      >
                        {year}
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className={styles.calendarGrid}>
                  {headers.map((header) => (
                    <span className={styles.calendarWeekday} key={header}>
                      {header}
                    </span>
                  ))}
                  {cells.map((day, index) => {
                    if (day === null) {
                      return (
                        <span className={styles.calendarBlank} key={`blank-${String(index)}`} />
                      )
                    }
                    const iso = toIsoDate(view.year, view.month, day)
                    const selected = iso === value
                    const holiday = findBrazilianHoliday(iso)
                    return (
                      <button
                        aria-pressed={selected}
                        className={[
                          styles.calendarDay ?? '',
                          selected ? (styles.calendarDayEdge ?? '') : '',
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
              )}
              {monthHolidays.length === 0 || showYears ? null : (
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
                    onChange('')
                    setDraft(null)
                    setOpen(false)
                    setShowYears(false)
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
