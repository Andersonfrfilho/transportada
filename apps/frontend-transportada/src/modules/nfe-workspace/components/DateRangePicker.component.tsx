/* Copyright (c) 2026 Ada Technology. MIT License. */
import { useEffect, useMemo, useRef, useState, type JSX } from 'react'

import styles from '../styles/nfeWorkspace.module.css'

type DateRangePickerProps = Readonly<{
  ariaLabel: string
  clearLabel: string
  from: string
  nextMonthLabel: string
  onChange: (from: string, to: string) => void
  placeholder: string
  previousMonthLabel: string
  to: string
}>

const MONTH_FORMATTER = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('pt-BR', { weekday: 'short' })
const DISPLAY_FORMATTER = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

type ViewMonth = Readonly<{ month: number; year: number }>

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

function isoToView(value: string): ViewMonth | null {
  if (value.length < 7) return null
  return { month: Number(value.slice(5, 7)) - 1, year: Number(value.slice(0, 4)) }
}

function formatDisplay(value: string): string {
  return DISPLAY_FORMATTER.format(new Date(`${value}T00:00:00`))
}

function weekdayHeaders(): readonly string[] {
  const headers: string[] = []
  for (let index = 0; index < 7; index += 1) {
    const reference = new Date(2023, 0, 1 + index)
    headers.push(WEEKDAY_FORMATTER.format(reference).replace('.', ''))
  }
  return headers
}

function shiftMonth(view: ViewMonth, delta: number): ViewMonth {
  const total = view.year * 12 + view.month + delta
  return { month: ((total % 12) + 12) % 12, year: Math.floor(total / 12) }
}

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
  const initialView =
    isoToView(from) ??
    (() => {
      const now = new Date()
      return { month: now.getMonth(), year: now.getFullYear() }
    })()
  const [view, setView] = useState<ViewMonth>(initialView)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return undefined
    function handlePointer(event: MouseEvent): void {
      if (rootRef.current !== null && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointer)
    return () => document.removeEventListener('mousedown', handlePointer)
  }, [open])

  const headers = useMemo(() => weekdayHeaders(), [])

  const cells = useMemo(() => {
    const firstWeekday = new Date(view.year, view.month, 1).getDay()
    const daysInMonth = new Date(view.year, view.month + 1, 0).getDate()
    const list: (number | null)[] = []
    for (let blank = 0; blank < firstWeekday; blank += 1) list.push(null)
    for (let day = 1; day <= daysInMonth; day += 1) list.push(day)
    return list
  }, [view])

  function handleDayClick(day: number): void {
    const iso = toIso(view.year, view.month, day)
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
      : `${from.length > 0 ? formatDisplay(from) : '…'} – ${to.length > 0 ? formatDisplay(to) : '…'}`

  return (
    <div className={styles.datePicker} ref={rootRef}>
      <button
        aria-expanded={open}
        aria-label={ariaLabel}
        className={styles.selectTrigger}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span
          className={
            from.length === 0 && to.length === 0
              ? (styles.selectPlaceholder ?? '')
              : (styles.selectValue ?? '')
          }
        >
          {label}
        </span>
        <svg aria-hidden="true" className={styles.selectChevron} viewBox="0 0 24 24">
          <path d="M8 2v4M16 2v4M3 10h18M5 6h14a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
        </svg>
      </button>
      {open ? (
        <div className={styles.calendar}>
          <div className={styles.calendarHeader}>
            <button
              aria-label={previousMonthLabel}
              className={styles.iconAction}
              onClick={() => setView((current) => shiftMonth(current, -1))}
              type="button"
            >
              <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <span className={styles.calendarTitle}>
              {MONTH_FORMATTER.format(new Date(view.year, view.month, 1))}
            </span>
            <button
              aria-label={nextMonthLabel}
              className={styles.iconAction}
              onClick={() => setView((current) => shiftMonth(current, 1))}
              type="button"
            >
              <svg aria-hidden="true" className={styles.actionIcon} viewBox="0 0 24 24">
                <path d="M9 18l6-6-6-6" />
              </svg>
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
              const iso = toIso(view.year, view.month, day)
              const active = isInRange(iso)
              const edge = iso === from || iso === to
              return (
                <button
                  aria-pressed={active}
                  className={[
                    styles.calendarDay ?? '',
                    active ? (styles.calendarDayInRange ?? '') : '',
                    edge ? (styles.calendarDayEdge ?? '') : '',
                  ]
                    .filter((name) => name.length > 0)
                    .join(' ')}
                  key={iso}
                  onClick={() => handleDayClick(day)}
                  type="button"
                >
                  {day}
                </button>
              )
            })}
          </div>
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
        </div>
      ) : null}
    </div>
  )
}
