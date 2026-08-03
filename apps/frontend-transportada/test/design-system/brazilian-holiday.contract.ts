/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const HOLIDAY_SERVICE_PATH = '@/components/ui/brazilianHoliday.service'

type BrazilianHoliday = Readonly<{ date: string; name: string }>

type HolidayServiceModule = Readonly<{
  findBrazilianHoliday: (isoDate: string) => string | undefined
  listBrazilianHolidays: (year: number) => readonly BrazilianHoliday[]
}>

async function loadHolidayService(): Promise<HolidayServiceModule> {
  return (await import(HOLIDAY_SERVICE_PATH)) as HolidayServiceModule
}

describe('design system brazilian holiday contract', () => {
  test('lists every fixed national holiday of the year', async () => {
    const { listBrazilianHolidays } = await loadHolidayService()

    const holidays = listBrazilianHolidays(2026)

    expect(holidays).toContainEqual({ date: '2026-01-01', name: 'Confraternizacao Universal' })
    expect(holidays).toContainEqual({ date: '2026-04-21', name: 'Tiradentes' })
    expect(holidays).toContainEqual({ date: '2026-05-01', name: 'Dia do Trabalho' })
    expect(holidays).toContainEqual({ date: '2026-09-07', name: 'Independencia do Brasil' })
    expect(holidays).toContainEqual({ date: '2026-10-12', name: 'Nossa Senhora Aparecida' })
    expect(holidays).toContainEqual({ date: '2026-11-02', name: 'Finados' })
    expect(holidays).toContainEqual({ date: '2026-11-15', name: 'Proclamacao da Republica' })
    expect(holidays).toContainEqual({ date: '2026-11-20', name: 'Consciencia Negra' })
    expect(holidays).toContainEqual({ date: '2026-12-25', name: 'Natal' })
  })

  test('derives the movable holidays from Easter in every year', async () => {
    const { listBrazilianHolidays } = await loadHolidayService()

    // Pascoa: 31/03/2024, 20/04/2025, 05/04/2026.
    expect(listBrazilianHolidays(2024)).toContainEqual({
      date: '2024-03-29',
      name: 'Sexta-feira Santa',
    })
    expect(listBrazilianHolidays(2025)).toContainEqual({
      date: '2025-06-19',
      name: 'Corpus Christi',
    })
    expect(listBrazilianHolidays(2026)).toContainEqual({
      date: '2026-02-16',
      name: 'Carnaval',
    })
    expect(listBrazilianHolidays(2026)).toContainEqual({
      date: '2026-02-17',
      name: 'Carnaval',
    })
    expect(listBrazilianHolidays(2026)).toContainEqual({
      date: '2026-04-03',
      name: 'Sexta-feira Santa',
    })
    expect(listBrazilianHolidays(2026)).toContainEqual({
      date: '2026-06-04',
      name: 'Corpus Christi',
    })
  })

  test('keeps the list sorted and restricted to the requested year', async () => {
    const { listBrazilianHolidays } = await loadHolidayService()

    const holidays = listBrazilianHolidays(2026)
    const dates = holidays.map((holiday) => holiday.date)

    expect(dates).toEqual([...dates].sort())
    expect(dates.every((date) => date.startsWith('2026-'))).toBe(true)
    expect(new Set(dates).size).toBe(dates.length)
  })

  test('answers the holiday name for a date and nothing for a common day', async () => {
    const { findBrazilianHoliday } = await loadHolidayService()

    expect(findBrazilianHoliday('2026-12-25')).toBe('Natal')
    expect(findBrazilianHoliday('2026-06-04')).toBe('Corpus Christi')
    expect(findBrazilianHoliday('2026-07-30')).toBeUndefined()
    expect(findBrazilianHoliday('')).toBeUndefined()
  })

  test('marks the holiday inside the range calendar with its name', async () => {
    const component = await Bun.file(
      new URL('src/components/ui/date-range-picker.tsx', new URL('../..', import.meta.url)),
    ).text()

    expect(component).toContain("from './brazilianHoliday.service'")
    expect(component).toContain('findBrazilianHoliday(')
    expect(component).toContain('title=')
    expect(component).toContain('calendarDayHoliday')
  })
})
