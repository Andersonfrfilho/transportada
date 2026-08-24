/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const DUE_DATE_SERVICE_PATH = 'src/modules/billing/shared/billingDueDate.service.ts'
const DUE_DATE_FIELD_PATH = 'src/modules/billing/components/DueDateField.component.tsx'
const WORKSPACE_PAGE_PATH = 'src/modules/billing/pages/BillingWorkspace.page.tsx'

type DueDateServiceModule = Readonly<{
  BILLING_DUE_DATE_TERMS: readonly number[]
  resolveDueDateFromTerm: (input: Readonly<{ days: number; today: string }>) => string
  resolveTermFromDueDate: (input: Readonly<{ dueDate: string; today: string }>) => number | null
}>

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

async function loadDueDateService(): Promise<DueDateServiceModule> {
  return await import('@/modules/billing/shared/billingDueDate.service')
}

describe('billing due date field contract', () => {
  test('offers the commercial terms of 5, 10, 15, 20 and 30 days', async () => {
    const { BILLING_DUE_DATE_TERMS } = await loadDueDateService()

    expect(BILLING_DUE_DATE_TERMS).toEqual([5, 10, 15, 20, 30])
  })

  test('turns a term into a date counted from today, crossing month and year', async () => {
    const { resolveDueDateFromTerm } = await loadDueDateService()

    expect(resolveDueDateFromTerm({ days: 5, today: '2026-07-30' })).toBe('2026-08-04')
    expect(resolveDueDateFromTerm({ days: 30, today: '2026-07-30' })).toBe('2026-08-29')
    expect(resolveDueDateFromTerm({ days: 15, today: '2026-12-25' })).toBe('2027-01-09')
    expect(resolveDueDateFromTerm({ days: 10, today: '2028-02-20' })).toBe('2028-03-01')
  })

  test('reads back the term of a date picked in the calendar, or none', async () => {
    const { resolveTermFromDueDate } = await loadDueDateService()

    expect(resolveTermFromDueDate({ dueDate: '2026-08-04', today: '2026-07-30' })).toBe(5)
    expect(resolveTermFromDueDate({ dueDate: '2026-08-29', today: '2026-07-30' })).toBe(30)
    expect(resolveTermFromDueDate({ dueDate: '2026-08-07', today: '2026-07-30' })).toBeNull()
    expect(resolveTermFromDueDate({ dueDate: '', today: '2026-07-30' })).toBeNull()
  })

  test('renders one date and one term select, never a period picker', async () => {
    const component = await readApplicationFile(DUE_DATE_FIELD_PATH)

    expect(component).toContain('export function DueDateField(')
    expect(component).toContain("from '@/components/ui/date-picker'")
    expect(component).toContain("from '@/components/ui/select'")
    expect(component).toContain('BILLING_DUE_DATE_TERMS')
    expect(component).not.toContain('DateRangePicker')
    expect(component).not.toContain('<select')
    expect(component).not.toContain('type="date"')
  })

  test('keeps the invoice tab free of the period picker for the due date', async () => {
    const page = await readApplicationFile(WORKSPACE_PAGE_PATH)

    expect(page).toContain('<DueDateField')
    expect(page).not.toContain('DateRangePicker')
    expect(page).not.toContain('to=""')
  })

  test('keeps the due date term as a pure service outside the component', async () => {
    const service = await readApplicationFile(DUE_DATE_SERVICE_PATH)

    expect(service).not.toContain('react')
    expect(service).not.toContain('useState')
  })
  /** A data e o prazo ficam lado a lado: alturas diferentes desalinham os dois na mesma linha. */
  test('matches the date field height to the term select beside it', async () => {
    const component = await Bun.file(
      new URL('../../src/modules/billing/components/DueDateField.component.tsx', import.meta.url),
    ).text()
    const stylesheet = await Bun.file(
      new URL('../../src/modules/billing/components/DueDateField.module.css', import.meta.url),
    ).text()

    expect(component).toContain('compact')
    expect(stylesheet).toContain('align-items: stretch')
    expect(stylesheet).not.toContain('align-items: start')
  })
})
