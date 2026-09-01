import { describe, expect, test } from 'bun:test'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

type LocaleFile = Readonly<{ creation: Readonly<Record<string, string>> }>

const PANEL_PATH = 'src/modules/trip/components/TripCreationPanel.component.tsx'
const CREATION_HOOK_PATH = 'src/modules/trip/hooks/useTripCreation.hook.ts'

describe('trip creation panel contract', () => {
  /**
   * "Selecione o veículo" e nada mais era o campo antes desta regra: a placa sozinha não diz se o
   * caminhão é da transportadora, e quem cria a viagem escolhia às cegas entre duas parecidas.
   */
  test('feeds the vehicle select with the fleet detail line and colour square', async () => {
    const panel = await readApplicationFile(PANEL_PATH)

    expect(panel).toContain("import { Select } from '@/components/ui/select'")
    expect(panel).toContain('useVehicleSelectOptions')
    expect(panel).toContain('options={vehicleOptions}')
    expect(panel).toContain("searchPlaceholder={t('creation.vehicleSearch')}")
  })

  /** Só quem traciona puxa a viagem: reboque na lista é escolha que a API recusaria depois. */
  test('offers only the active traction vehicle', async () => {
    const panel = await readApplicationFile(PANEL_PATH)

    expect(panel).toContain("vehicle.status === 'active' && vehicle.role === 'traction'")
  })

  /**
   * A lista de caixas crescia com a frota e empurrava o botão de criar para fora da tela. O
   * multi-select fecha a lista num gatilho com a contagem, e é buscável por nome.
   */
  test('picks the drivers through the multi-select, never a checkbox list', async () => {
    const panel = await readApplicationFile(PANEL_PATH)

    expect(panel).toContain("import { MultiSelect } from '@/components/ui/multi-select'")
    expect(panel).toContain('<MultiSelect')
    expect(panel).toContain('values={creation.draft.driverIds}')
    expect(panel).toContain('onChange={creation.setDriverIds}')
    expect(panel).toContain("summaryLabel={(count) => t('creation.driversSummary', { count })}")
    expect(panel).not.toContain('driverChecklist')
    expect(panel).not.toContain('Checkbox')
  })

  /** Motorista inativo continua na frota e não pode ser oferecido para uma viagem nova. */
  test('offers only the active driver', async () => {
    const panel = await readApplicationFile(PANEL_PATH)

    expect(panel).toContain("driver.status === 'active'")
    expect(panel).toContain("t('creation.driversEmpty')")
  })

  /** O multi-select devolve a seleção inteira: alternar um id de cada vez era do checklist. */
  test('writes the whole driver selection into the draft', async () => {
    const hook = await readApplicationFile(CREATION_HOOK_PATH)

    expect(hook).toContain('function setDriverIds(driverIds: readonly string[]): void')
    expect(hook).not.toContain('toggleDriver')
  })

  /** Rótulo visível não nasce no componente — nem em português nem em inglês. */
  test('names every new field in both locales', async () => {
    const [ptBr, english] = await Promise.all([
      readApplicationFile('src/modules/trip/locales/trip.locale.json'),
      readApplicationFile('src/modules/trip/locales/trip.en.locale.json'),
    ])

    const keys = [
      'vehicleSearch',
      'driversPlaceholder',
      'driversSearch',
      'driversNoMatch',
      'driversSummary',
      'driversSummary_other',
      'driversRemove',
      'driversClearAll',
    ]

    const ptBrCreation = (JSON.parse(ptBr) as LocaleFile).creation
    const englishCreation = (JSON.parse(english) as LocaleFile).creation

    for (const key of keys) {
      expect(ptBrCreation).toHaveProperty(key)
      expect(englishCreation).toHaveProperty(key)
    }
  })
})
