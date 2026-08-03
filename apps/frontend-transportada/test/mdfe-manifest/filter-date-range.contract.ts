/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const MANIFEST_FILTERS_PATH =
  'src/modules/mdfe-manifest/components/MdfeManifestFilters.component.tsx'
const LOCALE_PATHS = [
  'src/modules/mdfe-manifest/locales/mdfeManifest.locale.json',
  'src/modules/mdfe-manifest/locales/mdfeManifest.en.locale.json',
] as const
const DATE_RANGE_KEYS = ['clear', 'nextMonth', 'placeholder', 'previousMonth'] as const

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readApplicationJson(filePath: string): Promise<unknown> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).json()
}

describe('mdfe manifest filter date range contract', () => {
  test('takes the creation period from the design system picker', async () => {
    const source = await readApplicationFile(MANIFEST_FILTERS_PATH)

    expect(source).toContain("import { DateRangePicker } from '@/components/ui/date-range-picker'")
    expect(source).toContain('<DateRangePicker')
    expect(source).not.toContain('type="date"')
  })

  test('writes both ends of the creation period in a single change', async () => {
    const source = await readApplicationFile(MANIFEST_FILTERS_PATH)

    expect(source).toContain("setTextFilter('createdFrom', from)")
    expect(source).toContain("setTextFilter('createdTo', to)")
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
