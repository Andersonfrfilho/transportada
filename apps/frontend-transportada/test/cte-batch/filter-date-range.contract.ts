/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const BATCH_FILTERS_PATH = 'src/modules/cte-batch/components/CteBatchFilters.component.tsx'
const ITEM_FILTERS_PATH = 'src/modules/cte-batch/components/CteItemFilters.component.tsx'
const LOCALE_PATHS = [
  'src/modules/cte-batch/locales/cteBatch.locale.json',
  'src/modules/cte-batch/locales/cteBatch.en.locale.json',
] as const
const DATE_RANGE_KEYS = ['clear', 'nextMonth', 'placeholder', 'previousMonth'] as const

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readApplicationJson(filePath: string): Promise<unknown> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).json()
}

describe('cte batch filter date range contract', () => {
  test('takes the batch period from the design system picker', async () => {
    const source = await readApplicationFile(BATCH_FILTERS_PATH)

    expect(source).toContain("import { DateRangePicker } from '@/components/ui/date-range-picker'")
    expect(source).toContain('<DateRangePicker')
    expect(source).not.toContain('type="date"')
  })

  test('writes both ends of the batch period in a single change', async () => {
    const source = await readApplicationFile(BATCH_FILTERS_PATH)

    expect(source).toContain("setTextFilter('createdFrom', from)")
    expect(source).toContain("setTextFilter('createdTo', to)")
  })

  test('takes the issue period from the design system picker', async () => {
    const source = await readApplicationFile(ITEM_FILTERS_PATH)

    expect(source).toContain("import { DateRangePicker } from '@/components/ui/date-range-picker'")
    expect(source).toContain('<DateRangePicker')
    expect(source).not.toContain('type="date"')
    expect(source).not.toContain('DATE_FIELDS')
  })

  test('writes both ends of the issue period in a single change', async () => {
    const source = await readApplicationFile(ITEM_FILTERS_PATH)

    expect(source).toContain("setTextFilter('issuedFrom', from)")
    expect(source).toContain("setTextFilter('issuedTo', to)")
  })

  test('translates the picker chrome in both locales', async () => {
    for (const localePath of LOCALE_PATHS) {
      const locale = (await readApplicationJson(localePath)) as Record<string, unknown>
      const dateRange = locale.dateRange as Record<string, unknown> | undefined

      expect(dateRange).toBeDefined()
      expect(Object.keys(dateRange ?? {}).sort()).toEqual([...DATE_RANGE_KEYS])
      for (const key of DATE_RANGE_KEYS) {
        expect(typeof (dateRange ?? {})[key]).toBe('string')
      }
    }
  })
})
