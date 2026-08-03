/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const PAGE_PATH = 'src/modules/cte-batch/pages/CteBatchWorkspace.page.tsx'
const LOCALE_PATH = 'src/modules/cte-batch/locales/cteBatch.locale.json'
const ENGLISH_LOCALE_PATH = 'src/modules/cte-batch/locales/cteBatch.en.locale.json'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).json()
}

describe('cte batch workspace tabs contract', () => {
  test('builds the workspace on the design system tabs instead of stacking both tables', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain("from '@/components/ui/tabs'")
    expect(page).toContain('<Tabs')
  })

  test('opens on the company wide cte table', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain("useState<'batches' | 'documents'>('documents')")

    const documentsTab = page.indexOf("id: 'documents'")
    const batchesTab = page.indexOf("id: 'batches'")
    expect(documentsTab).toBeGreaterThan(-1)
    expect(batchesTab).toBeGreaterThan(documentsTab)
  })

  test('keeps the item table in the documents panel and the batch table in the batches panel', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    const documentsTab = page.indexOf("id: 'documents'")
    const batchesTab = page.indexOf("id: 'batches'")
    const itemTable = page.indexOf('<CteItemTable')
    const batchTable = page.indexOf('<CteBatchTable')
    const itemsPanel = page.indexOf('<CteBatchItemsPanel')

    expect(itemTable).toBeGreaterThan(documentsTab)
    expect(itemTable).toBeLessThan(batchesTab)
    expect(batchTable).toBeGreaterThan(batchesTab)
    expect(itemsPanel).toBeGreaterThan(batchesTab)
  })

  test('falls back to the batches tab when the operator cannot read items', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain('canReadItems')
    expect(page).toContain('activeTab')
  })

  test('labels both tabs from the locales', async () => {
    for (const localePath of [LOCALE_PATH, ENGLISH_LOCALE_PATH]) {
      const locale = await readLocale(localePath)
      const tabs = locale['tabs']

      expect(typeof tabs).toBe('object')
      expect(Object.keys(tabs as Record<string, unknown>).sort()).toEqual(['batches', 'documents'])
    }
  })
})
