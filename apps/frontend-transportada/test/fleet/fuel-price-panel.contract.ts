/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const PANEL_PATH = 'src/modules/fleet/components/FuelPricePanel.component.tsx'
const HOOK_PATH = 'src/modules/fleet/hooks/useFuelPrices.hook.ts'
const PAGE_PATH = 'src/modules/fleet/pages/FleetWorkspace.page.tsx'

/** O catálogo da tela é o mesmo da API: cinco produtos, a unidade presa ao produto. */
const FUEL_PRODUCTS = [
  'diesel-s10',
  'diesel-s500',
  'gasolina-comum',
  'etanol-hidratado',
  'gnv',
] as const

const PANEL_LABEL_KEYS = [
  'title',
  'hint',
  'effective',
  'unavailable',
  'reference',
  'referenceMissing',
  'fieldLabel',
  'save',
  'clear',
  'saved',
  'error',
  'loadError',
] as const

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).json()
}

describe('fuel price presentation contract', () => {
  test('traduz cada rótulo do painel e cada combustível nos dois catálogos', async () => {
    const [portuguese, english] = await Promise.all([
      readLocale('src/modules/fleet/locales/fleet.locale.json'),
      readLocale('src/modules/fleet/locales/fleet.en.locale.json'),
    ])

    for (const locale of [portuguese, english]) {
      const fuelPrices = locale['fuelPrices'] as Record<string, unknown>
      const fuelOption = locale['fuelOption'] as Record<string, unknown>
      const fuelPriceSource = locale['fuelPriceSource'] as Record<string, unknown>

      for (const key of PANEL_LABEL_KEYS) expect(fuelPrices[key]).toBeString()
      for (const product of FUEL_PRODUCTS) expect(fuelOption[product]).toBeString()
      for (const source of ['anp', 'manual']) expect(fuelPriceSource[source]).toBeString()
      for (const unit of ['litre', 'cubic-metre'])
        expect((fuelPrices['unit'] as Record<string, unknown>)[unit]).toBeString()
    }
  })

  test('desenha uma linha por combustível do catálogo, e não só as que têm preço', async () => {
    const component = await readModule(PANEL_PATH)

    expect(component).toContain('FUEL_PRODUCTS')
    expect(component).toContain('fuelOption.')
  })

  test('a referência da ANP fica ao lado do valor efetivo, como comparação', async () => {
    const component = await readModule(PANEL_PATH)

    expect(component).toContain('fuelPrices.effective')
    expect(component).toContain('fuelPrices.reference')
    expect(component).toContain('reference')
  })

  test('a ação de limpar só existe onde há ajuste da transportadora', async () => {
    const component = await readModule(PANEL_PATH)

    expect(component).toContain("source === 'manual'")
    expect(component).toContain('fuelPrices.clear')
    expect(component).toContain('onClear')
  })

  test('o painel entra na tela com esqueleto e sem controle fora do design system', async () => {
    const [component, hook, page] = await Promise.all([
      readModule(PANEL_PATH),
      readModule(HOOK_PATH),
      readModule(PAGE_PATH),
    ])

    expect(page).toContain('<FuelPricePanel')
    expect(component).toContain('Skeleton')
    expect(component).toContain('Icon')
    expect(component).not.toContain('<svg')
    expect(component).not.toContain('<select')
    expect(component).not.toContain("type='checkbox'")
    expect(component).not.toContain('type="checkbox"')
    expect(component).not.toMatch(/#[0-9a-f]{3,8}\b/i)
    for (const method of ['adjustFuelPrice', 'clearFuelPrice', 'getFuelPrices']) {
      expect(hook).toContain(method)
    }
  })
})
