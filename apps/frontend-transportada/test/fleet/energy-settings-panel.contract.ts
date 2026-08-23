/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)
const PANEL_PATH = 'src/modules/fleet/components/EnergySettingsPanel.component.tsx'
const HOOK_PATH = 'src/modules/fleet/hooks/useEnergySettings.hook.ts'
const PAGE_PATH = 'src/modules/fleet/pages/FleetWorkspace.page.tsx'
const CLIENT_PATH = 'src/modules/company-settings/shared/companySettingsClient.service.ts'
const VALIDATION_PATH = 'src/modules/company-settings/shared/energySettings.validation.ts'

const PANEL_LABEL_KEYS = [
  'title',
  'hint',
  'distributorLabel',
  'distributorPlaceholder',
  'factorLabel',
  'factorHint',
  'save',
  'clear',
  'saved',
  'error',
  'loadError',
  'emptyCatalog',
  'unchosen',
] as const

function readModule(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

function readLocale(filePath: string): Promise<Record<string, unknown>> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).json()
}

describe('energy settings presentation contract', () => {
  test('traduz cada rótulo do painel nos dois catálogos', async () => {
    const [portuguese, english] = await Promise.all([
      readLocale('src/modules/fleet/locales/fleet.locale.json'),
      readLocale('src/modules/fleet/locales/fleet.en.locale.json'),
    ])

    for (const locale of [portuguese, english]) {
      const energySettings = locale['energySettings'] as Record<string, unknown>
      for (const key of PANEL_LABEL_KEYS) expect(energySettings[key]).toBeString()
    }
  })

  /**
   * A sigla da ANEEL não é adivinhável, e código digitado errado não falha na hora: ele grava uma
   * escolha que nunca vira preço. A lista é a única entrada — e por isso vem do `@/components/ui`,
   * nunca do `<select>` nativo, que o país inteiro de distribuidoras faria crescer sem busca.
   */
  test('a distribuidora é escolhida de uma lista, nunca digitada', async () => {
    const component = await readModule(PANEL_PATH)

    expect(component).toContain('@/components/ui/select')
    expect(component).toContain('distributors')
    expect(component).not.toContain('<select')
    expect(component).not.toMatch(/<input[^>]*energy-distributor/u)
  })

  test('a lista vazia diz que a coleta ainda não rodou, em vez de campo mudo', async () => {
    const component = await readModule(PANEL_PATH)

    expect(component).toContain('energySettings.emptyCatalog')
  })

  /**
   * A tarifa homologada é seca, e o fator é o que a leva ao que a conta cobra. Sem o aviso ao lado
   * do campo, `1,0000` parece preço final e o R$/km do elétrico nasce abaixo do que a frota paga.
   */
  test('o fator explica que a tarifa não tem imposto nem bandeira', async () => {
    const [component, portuguese] = await Promise.all([
      readModule(PANEL_PATH),
      readLocale('src/modules/fleet/locales/fleet.locale.json'),
    ])
    const energySettings = portuguese['energySettings'] as Record<string, string>

    expect(component).toContain('energySettings.factorHint')
    expect(energySettings['factorHint']).toContain('imposto')
  })

  test('limpar só existe quando há distribuidora escolhida', async () => {
    const component = await readModule(PANEL_PATH)

    expect(component).toContain('energySettings.clear')
    expect(component).toContain('onClear')
    expect(component).toContain('distributorCode !== null')
  })

  test('o painel entra na aba Combustível, com esqueleto e sem controle fora do design system', async () => {
    const [component, page] = await Promise.all([readModule(PANEL_PATH), readModule(PAGE_PATH)])

    expect(page).toContain('<EnergySettingsPanel')
    expect(page).toContain('useEnergySettings')
    expect(component).toContain('Skeleton')
    expect(component).not.toContain('<svg')
    expect(component).not.toContain('type="checkbox"')
    expect(component).not.toMatch(/#[0-9a-f]{3,8}\b/i)
  })

  test('o hook fala com a API pelos três métodos do cliente do módulo', async () => {
    const [client, hook] = await Promise.all([readModule(CLIENT_PATH), readModule(HOOK_PATH)])

    for (const method of [
      'getEnergySettings',
      'chooseEnergyDistributor',
      'clearEnergyDistributor',
    ]) {
      expect(client).toContain(method)
      expect(hook).toContain(method)
    }
    expect(client).toContain("'/company-settings/energy'")
  })

  /**
   * O guarda é de chaves exatas: campo novo na resposta derruba a tela inteira com um 200 válido.
   * Ele é escrito aqui porque o bundle não carrega código da API, e é a lista de chaves que precisa
   * andar junto do que a rota devolve.
   */
  test('a resposta é conferida por chaves exatas antes de chegar à tela', async () => {
    const validation = await readModule(VALIDATION_PATH)

    expect(validation).toContain('hasExactKeys')
    for (const key of ['adjustmentFactor', 'distributorCode', 'distributors', 'code', 'taxId']) {
      expect(validation).toContain(key)
    }
  })
})
