/* Copyright (c) 2026 Ada Technology. MIT License. */
import { readdir } from 'node:fs/promises'
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const CALENDAR_SERVICE_PATH = 'src/components/ui/calendar.service.ts'
const DATE_PICKER_PATH = 'src/components/ui/date-picker.tsx'
const RANGE_PICKER_PATH = 'src/components/ui/date-range-picker.tsx'

type CalendarServiceModule = Readonly<{
  buildYearChoices: () => readonly number[]
  isoToDisplayDate: (value: string) => string
  maskTypedDate: (value: string) => string
  parseDisplayDate: (display: string) => string | null
  buildMonthCells: (view: Readonly<{ month: number; year: number }>) => readonly (number | null)[]
  isoToViewMonth: (value: string) => Readonly<{ month: number; year: number }> | null
  shiftViewMonth: (
    view: Readonly<{ month: number; year: number }>,
    delta: number,
  ) => Readonly<{ month: number; year: number }>
  toIsoDate: (year: number, month: number, day: number) => string
}>

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function loadCalendarService(): Promise<CalendarServiceModule> {
  return await import('@/components/ui/calendar.service')
}

async function listSourceComponents(): Promise<readonly string[]> {
  const entries = await readdir(new URL('src', APPLICATION_ROOT), { recursive: true })
  return entries.filter((entry) => entry.endsWith('.tsx')).map((entry) => `src/${entry}`)
}

describe('design system date picker contract', () => {
  test('publishes the calendar helpers as one pure service', async () => {
    const { buildMonthCells, isoToViewMonth, shiftViewMonth, toIsoDate } =
      await loadCalendarService()

    expect(toIsoDate(2026, 7, 5)).toBe('2026-08-05')
    expect(isoToViewMonth('2026-08-05')).toEqual({ month: 7, year: 2026 })
    expect(isoToViewMonth('')).toBeNull()
    expect(shiftViewMonth({ month: 0, year: 2026 }, -1)).toEqual({ month: 11, year: 2025 })
    expect(shiftViewMonth({ month: 11, year: 2026 }, 1)).toEqual({ month: 0, year: 2027 })

    // Agosto de 2026 comeca no sabado e tem 31 dias.
    const cells = buildMonthCells({ month: 7, year: 2026 })
    expect(cells.slice(0, 7)).toEqual([null, null, null, null, null, null, 1])
    expect(cells.filter((cell) => cell !== null)).toHaveLength(31)
  })

  test('both pickers share the calendar service instead of copying the math', async () => {
    const datePicker = await readApplicationFile(DATE_PICKER_PATH)
    const rangePicker = await readApplicationFile(RANGE_PICKER_PATH)
    const calendarService = await readApplicationFile(CALENDAR_SERVICE_PATH)

    for (const source of [datePicker, rangePicker]) {
      expect(source).toContain("from './calendar.service'")
      expect(source).toContain("from './brazilianHoliday.service'")
      expect(source).not.toContain('function shiftMonth(')
      expect(source).not.toContain('function toIso(')
    }
    expect(calendarService).not.toContain('react')
    expect(calendarService).not.toContain('useState')
  })

  test('publishes a single date picker that never emits a period', async () => {
    const component = await readApplicationFile(DATE_PICKER_PATH)

    expect(component).toContain('export function DatePicker(')
    expect(component).toContain('onChange: (value: string) => void')
    expect(component).not.toContain('(from: string, to: string)')
    expect(component).not.toContain('isInRange')
  })

  test('closes the single date picker as soon as a day is picked', async () => {
    const component = await readApplicationFile(DATE_PICKER_PATH)

    expect(component).toMatch(/onChange\(iso\)[\s\S]{0,80}setOpen\(false\)/)
  })

  /**
   * O campo nativo muda de forma em cada navegador, não aceita os tokens do produto e ignora o
   * feriado que o calendário nosso marca — é o mesmo motivo que tirou o `<select>` nativo daqui.
   */
  test('forbids the native date input everywhere outside the design system', async () => {
    const components = await listSourceComponents()
    const offenders = []

    for (const filePath of components) {
      if (filePath.startsWith('src/components/ui/')) continue
      const source = await readApplicationFile(filePath)
      if (/type=(["'])date\1/.test(source)) offenders.push(filePath)
    }

    expect(offenders).toEqual([])
    expect(components.length).toBeGreaterThan(20)
  })

  test('documents the rule where the other field rules live', async () => {
    const fields = await Bun.file(
      new URL('../../../../docs/frontend/fields.md', import.meta.url),
    ).text()
    const claude = await Bun.file(new URL('../../../../CLAUDE.md', import.meta.url)).text()

    expect(fields).toContain('components/ui/date-picker')
    expect(fields).toContain('components/ui/date-range-picker')
    expect(fields).toContain('FleetDateField')
    expect(fields).toContain('ProfileDateField')
    expect(claude).toContain('test/design-system/date-picker.contract.ts')
  })

  test('keeps the single date picker on the shared calendar skin and tokens', async () => {
    const component = await readApplicationFile(DATE_PICKER_PATH)
    const styles = await readApplicationFile('src/components/ui/date-range-picker.module.css')

    expect(component).toContain("from './date-range-picker.module.css'")
    expect(component).toContain('SELECT_TRIGGER_CLASS_NAMES')
    expect(styles).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })

  /**
   * Data de nascimento fica a mais de quatrocentos cliques do mês de hoje: sem digitação e sem
   * escolha de ano, o campo obrigava a percorrer o calendário mês a mês até 1985.
   */
  test('accepts a typed date and offers the year without walking month by month', async () => {
    const { buildYearChoices, isoToDisplayDate, maskTypedDate, parseDisplayDate } =
      await loadCalendarService()

    expect(maskTypedDate('1')).toBe('1')
    expect(maskTypedDate('1503')).toBe('15/03')
    expect(maskTypedDate('15031985')).toBe('15/03/1985')
    expect(maskTypedDate('15/03/1985999')).toBe('15/03/1985')
    expect(parseDisplayDate('15/03/1985')).toBe('1985-03-15')
    expect(parseDisplayDate('31/02/1985')).toBeNull()
    expect(parseDisplayDate('00/03/1985')).toBeNull()
    expect(parseDisplayDate('15/03/198')).toBeNull()
    expect(isoToDisplayDate('1985-03-15')).toBe('15/03/1985')
    expect(isoToDisplayDate('')).toBe('')

    const years = buildYearChoices()
    const currentYear = new Date().getFullYear()
    expect(years[0]).toBe(currentYear + 20)
    expect(years.at(-1)).toBe(currentYear - 100)
    expect(years).toContain(1985)

    const component = await readApplicationFile(DATE_PICKER_PATH)
    expect(component).toContain('maskTypedDate')
    expect(component).toContain('buildYearChoices')
    expect(component).toContain('onChange={(event) => handleTyping(event.target.value)}')
  })
})
