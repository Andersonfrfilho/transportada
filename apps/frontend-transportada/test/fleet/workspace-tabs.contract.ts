/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const PAGE_PATH = 'src/modules/fleet/pages/FleetWorkspace.page.tsx'
const LOCALE_PATH = 'src/modules/fleet/locales/fleet.locale.json'
const ENGLISH_LOCALE_PATH = 'src/modules/fleet/locales/fleet.en.locale.json'

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).json()
}

describe('fleet workspace tabs contract', () => {
  test('builds the workspace on the design system tabs instead of stacking both panels', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain("from '@/components/ui/tabs'")
    expect(page).toContain('<Tabs')
    expect(page).toContain('readonly TabsItem[]')
  })

  test('opens on the vehicles tab and keeps the active tab in local state', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    expect(page).toContain("useState<FleetTabId>('vehicles')")
    expect(page).toContain('activeTab')

    const vehiclesTab = page.indexOf("id: 'vehicles'")
    const driversTab = page.indexOf("id: 'drivers'")
    expect(vehiclesTab).toBeGreaterThan(-1)
    expect(driversTab).toBeGreaterThan(vehiclesTab)
  })

  test('keeps each panel inside its own tab instead of one below the other', async () => {
    const page = await readApplicationFile(PAGE_PATH)

    const vehiclesTab = page.indexOf("id: 'vehicles'")
    const driversTab = page.indexOf("id: 'drivers'")
    const vehiclePanel = page.indexOf('<VehiclePanel')
    const driverPanel = page.indexOf('<DriverPanel')

    expect(vehiclePanel).toBeGreaterThan(vehiclesTab)
    expect(vehiclePanel).toBeLessThan(driversTab)
    expect(driverPanel).toBeGreaterThan(driversTab)
    expect(page.lastIndexOf('<VehiclePanel')).toBe(vehiclePanel)
    expect(page.lastIndexOf('<DriverPanel')).toBe(driverPanel)
  })

  test('labels both tabs from the locales with accented portuguese', async () => {
    for (const localePath of [LOCALE_PATH, ENGLISH_LOCALE_PATH]) {
      const locale = await readLocale(localePath)
      const tabs = locale['tabs']

      expect(typeof tabs).toBe('object')
      expect(Object.keys(tabs as Record<string, unknown>).sort()).toEqual([
        'applications',
        'drivers',
        'fuel',
        'regions',
        'vehicles',
      ])
    }

    const page = await readApplicationFile(PAGE_PATH)
    expect(page).toContain("t('tabs.vehicles')")
    expect(page).toContain("t('tabs.drivers')")

    const portugueseTabs = (await readLocale(LOCALE_PATH))['tabs'] as Record<string, string>
    expect(portugueseTabs['vehicles']).toBe('Veículos')
    expect(portugueseTabs['drivers']).toBe('Motoristas')
  })
})
