/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const FLEET_STYLES_PATH = 'src/modules/fleet/styles/fleet.module.css'
const FIELD_RESETS = ['min-width: 0', 'border-radius: 0', 'font: inherit'] as const
const NEW_LOCALE_KEYS = [
  'clearFilters',
  'driversEmptyHint',
  'driversEmptyTitle',
  'filtersEmptyHint',
  'filtersEmptyTitle',
  'vehicleOperationLegend',
  'vehicleOwnershipLegend',
  'vehiclesEmptyHint',
  'vehiclesEmptyTitle',
] as const

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function listRules(stylesheet: string): readonly { selector: string; body: string }[] {
  const withoutComments = stylesheet.replaceAll(/\/\*[\s\S]*?\*\//g, '')
  const rules: { selector: string; body: string }[] = []
  for (const match of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    rules.push({ body: match[2] ?? '', selector: (match[1] ?? '').trim() })
  }
  return rules
}

function findRule(stylesheet: string, fragment: string): { selector: string; body: string } {
  const rule = listRules(stylesheet).find(
    (candidate) => candidate.selector.includes(fragment) && candidate.body.includes('min-height:'),
  )
  if (rule === undefined) throw new Error(`missing field rule for ${fragment}`)
  return rule
}

describe('fleet screen standards contract', () => {
  // A barra de filtro fica ao lado de selects compactos; a mesma métrica do formulário desalinhava
  test('sizes the filter bar by the compact metric and the form by the full metric', async () => {
    const stylesheet = await readApplicationFile(FLEET_STYLES_PATH)
    const filterField = findRule(stylesheet, '.filterBar input')
    const formField = findRule(stylesheet, '.fieldGrid input')

    expect(filterField.body).toContain('min-height: var(--field-height-compact)')
    expect(filterField.body).toContain('padding: var(--field-padding-compact)')
    expect(filterField.body).toContain('font-size: var(--field-font-size-compact)')
    expect(formField.body).toContain('min-height: var(--field-height)')
    expect(formField.body).toContain('padding: var(--field-padding)')
    expect(formField.body).toContain('font-size: var(--field-font-size)')
    expect(formField.selector).toContain('.plateRow input')
  })

  test('resets the browser chrome on every fleet field', async () => {
    const stylesheet = await readApplicationFile(FLEET_STYLES_PATH)
    const rules = [
      findRule(stylesheet, '.filterBar input'),
      findRule(stylesheet, '.fieldGrid input'),
    ]

    for (const rule of rules) {
      for (const declaration of FIELD_RESETS) expect(rule.body).toContain(declaration)
    }
  })

  test('gives every fleet field a visible focus ring', async () => {
    const stylesheet = await readApplicationFile(FLEET_STYLES_PATH)
    const focusRules = listRules(stylesheet).filter((rule) => rule.selector.includes('input:focus'))

    expect(focusRules.length).toBeGreaterThan(0)
    for (const rule of focusRules) {
      expect(rule.body).toContain('outline: 2px solid')
      expect(rule.body).toContain('var(--color-copper)')
      expect(rule.body).toContain('outline-offset:')
    }
  })

  test('replaces the loading sentence and the empty render with a table skeleton', async () => {
    const [hint, vehiclePanel, driverPanel, skeleton] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/FleetStatusHint.component.tsx'),
      readApplicationFile('src/modules/fleet/components/VehiclePanel.component.tsx'),
      readApplicationFile('src/modules/fleet/components/DriverPanel.component.tsx'),
      readApplicationFile('src/modules/fleet/components/FleetTableSkeleton.component.tsx'),
    ])

    expect(hint).toContain('loading: null')
    expect(hint).toContain('empty: null')
    expect(skeleton).toContain('SkeletonGroup')
    expect(skeleton).toContain('columnCount')
    for (const panel of [vehiclePanel, driverPanel]) {
      expect(panel).toContain('FleetTableSkeleton')
      expect(panel).toContain("status === 'loading'")
      expect(panel).not.toContain('=== undefined ? null')
    }
  })

  // Tela vazia é convite para agir, não silêncio: título, motivo e o botão que resolve
  test('invites the operator to act on an empty fleet tab', async () => {
    const [emptyState, vehiclePanel, driverPanel, ptLocale, enLocale] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/FleetEmptyState.component.tsx'),
      readApplicationFile('src/modules/fleet/components/VehiclePanel.component.tsx'),
      readApplicationFile('src/modules/fleet/components/DriverPanel.component.tsx'),
      readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
      readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
    ])

    expect(emptyState).toContain('Button')
    expect(emptyState).toContain('onAction')
    expect(vehiclePanel).toContain("t('vehiclesEmptyTitle')")
    expect(driverPanel).toContain("t('driversEmptyTitle')")
    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, unknown>
      for (const key of NEW_LOCALE_KEYS) expect(typeof dictionary[key]).toBe('string')
    }
  })

  // A consulta por placa preenche o resto do cadastro: ela pertence ao lado da placa, não ao fim
  test('splits the vehicle form into identification, operation and ownership blocks', async () => {
    const [form, identity, operation, ownership] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/VehicleForm.component.tsx'),
      readApplicationFile('src/modules/fleet/components/VehicleIdentityFields.component.tsx'),
      readApplicationFile('src/modules/fleet/components/VehicleOperationFields.component.tsx'),
      readApplicationFile('src/modules/fleet/components/VehicleOwnerFields.component.tsx'),
    ])

    expect(form.indexOf('<VehicleIdentityFields')).toBeGreaterThan(-1)
    expect(form.indexOf('<VehicleOperationFields')).toBeGreaterThan(
      form.indexOf('<VehicleIdentityFields'),
    )
    expect(form.indexOf('<VehicleOwnerFields')).toBeGreaterThan(
      form.indexOf('<VehicleOperationFields'),
    )
    expect(form).not.toContain("t('lookupPlate')")

    expect(identity.indexOf("t('plate')")).toBeGreaterThan(-1)
    expect(identity.indexOf("t('lookupPlate')")).toBeGreaterThan(identity.indexOf("t('plate')"))
    expect(identity).toContain('plateRow')
    expect(identity).not.toContain("t('capacityKilograms')")
    expect(identity).not.toContain("t('ownership')")

    expect(operation).toContain("t('capacityKilograms')")
    expect(operation).toContain("t('wheelType')")
    expect(ownership.indexOf("t('ownership')")).toBeGreaterThan(-1)
    expect(ownership.indexOf("t('ownerName')")).toBeGreaterThan(ownership.indexOf("t('ownership')"))
  })
})
