/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const CALENDAR_DATE_SERVICE_PATH = 'src/modules/shared/calendarDate.service.ts'
const INVOICE_TABLE_PATH = 'src/modules/billing/components/BillingInvoiceTable.component.tsx'
const INVOICE_DETAIL_PATH = 'src/modules/billing/components/BillingInvoiceDetail.component.tsx'

type CalendarDateModule = Readonly<{
  formatCalendarDate: (value: string) => string
}>

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function loadCalendarDateService(): Promise<CalendarDateModule> {
  return await import('@/modules/shared/calendarDate.service')
}

describe('billing due date display contract', () => {
  test('reads the due date as a calendar day, never shifted by the local timezone', async () => {
    const { formatCalendarDate } = await loadCalendarDateService()

    /** Meia-noite UTC vira o dia anterior às 21h em UTC-3 — o vencimento não pode andar. */
    expect(formatCalendarDate('2026-08-20T00:00:00.000Z')).toBe('20/08/2026')
    expect(formatCalendarDate('2027-01-01T00:00:00.000Z')).toBe('01/01/2027')
    expect(formatCalendarDate('2026-08-20')).toBe('20/08/2026')
  })

  test('never prints a time for a date that has none in the domain', async () => {
    const { formatCalendarDate } = await loadCalendarDateService()

    expect(formatCalendarDate('2026-08-20T00:00:00.000Z')).not.toContain(':')
  })

  test('gives back the original text when the value is not a date', async () => {
    const { formatCalendarDate } = await loadCalendarDateService()

    expect(formatCalendarDate('sem data')).toBe('sem data')
    expect(formatCalendarDate('')).toBe('')
  })

  test('applies the calendar format to the due date on the list and on the detail', async () => {
    const table = await readApplicationFile(INVOICE_TABLE_PATH)
    const detail = await readApplicationFile(INVOICE_DETAIL_PATH)

    for (const source of [table, detail]) {
      expect(source).toContain("from '@/modules/shared/calendarDate.service'")
      expect(source).toMatch(/formatCalendarDate\((invoice|item)\.dueDate\)/)
      expect(source).not.toMatch(/formatMoment\(\s*invoice\.dueDate/)
      expect(source).not.toMatch(/formatMoment\(item\.dueDate\)/)
    }
    /** Emissão e criação continuam sendo instantes: data e hora. */
    expect(table).toContain('formatMoment(item.issuedAt)')
    expect(table).toContain('formatMoment(item.createdAt)')
  })

  test('keeps the calendar format as a pure service outside the components', async () => {
    const service = await readApplicationFile(CALENDAR_DATE_SERVICE_PATH)

    expect(service).not.toContain('react')
    expect(service).not.toContain('useState')
  })
})
