/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { loadFutureModule } from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const FEDERATION_UNIT_COUNT = 27
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

  // Com o editor fechado a segunda coluna continuava reservada: a tabela ficava em 60% da largura
  // e não fechava na mesma borda do cabeçalho da aplicação
  test('only splits the deck in two columns while the editor is open', async () => {
    const [stylesheet, page] = await Promise.all([
      readApplicationFile(FLEET_STYLES_PATH),
      readApplicationFile('src/modules/fleet/pages/FleetWorkspace.page.tsx'),
    ])
    const splitRules = listRules(stylesheet).filter(
      (rule) => rule.selector.includes('workspaceDeck') && rule.body.includes('fr)'),
    )

    expect(page).toContain('data-editor-open')
    expect(splitRules.length).toBeGreaterThan(0)
    for (const rule of splitRules) expect(rule.selector).toContain('data-editor-open')
  })

  // O cabeçalho do painel já traz "Novo veículo"; repetir na tela vazia dá dois botões idênticos
  test('offers a single new-vehicle action on an empty fleet', async () => {
    const vehiclePanel = await readApplicationFile(
      'src/modules/fleet/components/VehiclePanel.component.tsx',
    )

    expect(vehiclePanel.match(/t\('newVehicle'\)/g) ?? []).toHaveLength(1)
  })

  // Solto no cabeçalho, o botão de colunas era o terceiro item de um `space-between` e parava no
  // meio da faixa, longe da tabela que ele controla
  test('groups the header actions instead of spreading them across the heading', async () => {
    const [stylesheet, vehiclePanel] = await Promise.all([
      readApplicationFile(FLEET_STYLES_PATH),
      readApplicationFile('src/modules/fleet/components/VehiclePanel.component.tsx'),
    ])
    const heading = vehiclePanel.slice(
      vehiclePanel.indexOf('styles.panelHeading'),
      vehiclePanel.indexOf('<VehicleFilterBar'),
    )
    const actionsIndex = heading.indexOf('styles.panelActions')

    expect(stylesheet).toContain('.panelActions')
    expect(actionsIndex).toBeGreaterThan(-1)
    expect(heading.indexOf('styles.columnsMenuWrap')).toBeGreaterThan(actionsIndex)
    expect(heading.indexOf("t('newVehicle')")).toBeGreaterThan(actionsIndex)
  })

  // O cadastro abre com os seis campos de custo em branco, e branco não é escala de API: somar o
  // estado cru derrubava a tela inteira em `INVALID_AMOUNT` no clique de "Novo veículo"
  test('summarizes the costs of a form still being typed without throwing', async () => {
    const { summarizeTypedVehicleCosts } = await import(
      '../../src/modules/fleet/shared/fleetVehicleCost.service'
    )
    const { EMPTY_VEHICLE_FORM } = await import('../../src/modules/fleet/shared/fleetForm.service')
    const empty = { costPerKilometer: null, monthlyFixedCost: null }

    expect(summarizeTypedVehicleCosts(EMPTY_VEHICLE_FORM)).toEqual(empty)
    expect(summarizeTypedVehicleCosts({ ...EMPTY_VEHICLE_FORM, costPerKilometer: '1,' })).toEqual(
      empty,
    )
    const filled = summarizeTypedVehicleCosts({
      ...EMPTY_VEHICLE_FORM,
      annualInsuranceAmount: '3.600,00',
      annualVehicleTaxAmount: '1.200,00',
      costPerKilometer: '1,25',
      monthlyInstallmentAmount: '2.000,00',
    })

    // O separador que o `Intl` põe depois de "R$" é espaço não separável, não espaço comum
    expect(filled.monthlyFixedCost?.replace(/\s/gu, ' ')).toBe('R$ 2.400,00')
    expect(filled.costPerKilometer?.replace(/\s/gu, ' ')).toBe('R$ 1,25')
  })

  // O botão padrão tem 3rem e ficava uma cabeça acima do botão de ícone (2,25rem) e da barra de
  // filtro compacta (2,4rem) ao lado dele — `sm` é a altura de quem mora numa fileira de controles
  test('sizes the heading action by the dense-row metric', async () => {
    const [vehiclePanel, driverPanel] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/VehiclePanel.component.tsx'),
      readApplicationFile('src/modules/fleet/components/DriverPanel.component.tsx'),
    ])

    for (const [panel, label] of [
      [vehiclePanel, "t('newVehicle')"],
      [driverPanel, "t('newDriver')"],
    ] as const) {
      const heading = panel.slice(
        panel.indexOf('styles.panelHeading'),
        panel.indexOf('FilterBar filters'),
      )

      expect(heading).toContain(label)
      expect(heading).toContain('size="sm"')
    }
  })

  // O número da frota alimenta o <cInt> do MDF-e, que é opcional — quem não numera a frota
  // não pode ficar travado achando que o campo é exigido
  test('marks the fleet number as an optional field', async () => {
    const [field, modelFields, ptLocale, enLocale] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/FleetField.component.tsx'),
      readApplicationFile('src/modules/fleet/components/VehicleModelFields.component.tsx'),
      readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
      readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
    ])
    const fleetNumberField = modelFields.slice(modelFields.indexOf("t('fleetNumber')") - 200)

    expect(field).toContain('optional')
    expect(field).toContain('optionalMark')
    expect(fleetNumberField).toContain('optional')
    for (const locale of [ptLocale, enLocale]) {
      const dictionary = JSON.parse(locale) as Record<string, unknown>
      expect(typeof dictionary['optionalMark']).toBe('string')
      expect(typeof dictionary['fleetNumberHint']).toBe('string')
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

    expect(identity.indexOf("t('plate')")).toBeGreaterThan(-1)
    expect(identity).toContain('plateRow')
    expect(identity).not.toContain("t('capacityKilograms')")
    expect(identity).not.toContain("t('ownership')")

    expect(operation).toContain("t('capacityKilograms')")
    // Função e rodado ficam na identificação: o catálogo de marca e modelo depende deles
    expect(identity).toContain("t('wheelType')")
    expect(ownership.indexOf("t('ownership')")).toBeGreaterThan(-1)
    expect(ownership.indexOf("t('ownerName')")).toBeGreaterThan(ownership.indexOf("t('ownership')"))
  })

  test('picks the licensing state from the federation units instead of typing two letters', async () => {
    const { BRAZIL_STATE } = await loadFutureModule<FleetStateModule>(
      '../../src/modules/fleet/shared/fleet.types',
    )
    const [identity, ptLocale, enLocale] = await Promise.all([
      readApplicationFile('src/modules/fleet/components/VehicleIdentityFields.component.tsx'),
      readApplicationFile('src/modules/fleet/locales/fleet.locale.json'),
      readApplicationFile('src/modules/fleet/locales/fleet.en.locale.json'),
    ])

    // A UF é fechada: digitada, 'XX' atravessa o formulário e só a API reprova, no fim do preenchimento
    expect(BRAZIL_STATE).toHaveLength(FEDERATION_UNIT_COUNT)
    expect(new Set(BRAZIL_STATE).size).toBe(FEDERATION_UNIT_COUNT)
    expect([...BRAZIL_STATE]).toEqual([...BRAZIL_STATE].sort())

    expect(identity).toContain('options={BRAZIL_STATE}')
    expect(identity).toContain('optionLabelKey="stateOption"')
    // O campo de duas letras era a única razão do maxLength no bloco de identificação
    expect(identity).not.toContain('maxLength={2}')

    const pt = JSON.parse(ptLocale) as Record<string, Record<string, string>>
    const en = JSON.parse(enLocale) as Record<string, Record<string, string>>
    for (const unit of BRAZIL_STATE) {
      // Padrão "código — nome" do módulo, o mesmo do rodado e da carroceria
      expect(pt['stateOption']?.[unit]).toContain(unit)
      // Nome de estado é nome próprio: não se traduz de um dicionário para o outro
      expect(en['stateOption']?.[unit]).toBe(pt['stateOption']?.[unit])
    }
    expect(typeof pt['vehicleStateUnset']).toBe('string')
    expect(typeof en['vehicleStateUnset']).toBe('string')
  })
})

type FleetStateModule = {
  readonly BRAZIL_STATE: readonly string[]
}
