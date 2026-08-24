import { describe, expect, test } from 'bun:test'

import { VEHICLE_COLOR_SWATCH } from '@/modules/fleet/shared/fleet.constant'
import { VEHICLE_COLOR } from '@/modules/fleet/shared/fleet.types'

import { loadFutureModule } from './fleet.fixture'

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

type VehicleOptionModule = Readonly<{
  buildVehicleOptionDescription: (
    input: Readonly<{ brand: string; colorLabel: string; model: string; ownershipLabel: string }>,
  ) => string
  resolveVehicleColorSwatch: (color: string) => string | undefined
}>

function loadVehicleOption(): Promise<VehicleOptionModule> {
  return loadFutureModule<VehicleOptionModule>(
    '../../src/modules/fleet/shared/vehicleOption.service',
  )
}

describe('fleet vehicle select options contract', () => {
  /**
   * A placa identifica o veículo; esta linha é o que faz escolher um em vez do outro. Quem cria a
   * viagem precisa saber se o caminhão é da transportadora antes de vincular o motorista a ele.
   */
  test('states ownership, brand and model, and colour in one line', async () => {
    const { buildVehicleOptionDescription } = await loadVehicleOption()

    expect(
      buildVehicleOptionDescription({
        brand: 'Volvo',
        colorLabel: 'Branca',
        model: 'FH 460',
        ownershipLabel: 'Próprio da transportadora',
      }),
    ).toBe('Próprio da transportadora · Volvo FH 460 · Branca')
  })

  /** Veículo sem modelo cadastrado mostraria " ·  · " e ninguém saberia o que faltou. */
  test('drops the empty part instead of printing a loose separator', async () => {
    const { buildVehicleOptionDescription } = await loadVehicleOption()

    expect(
      buildVehicleOptionDescription({
        brand: '  ',
        colorLabel: '',
        model: '',
        ownershipLabel: 'Agregado',
      }),
    ).toBe('Agregado')

    expect(
      buildVehicleOptionDescription({
        brand: 'Scania',
        colorLabel: '',
        model: '',
        ownershipLabel: 'Terceiro',
      }),
    ).toBe('Terceiro · Scania')
  })

  /** O tom real vive em `:root`: o módulo monta o caminho até ele, nunca a cor crua. */
  test('paints every colour of the closed list from its token', async () => {
    const { resolveVehicleColorSwatch } = await loadVehicleOption()

    for (const color of VEHICLE_COLOR) {
      expect(resolveVehicleColorSwatch(color)).toBe(VEHICLE_COLOR_SWATCH[color])
    }
  })

  /**
   * Frota cadastrada antes da lista fechada guarda texto livre: não há tom para pintar "prata
   * metálico", e inventar um mentiria sobre o CRLV.
   */
  test('leaves the free-text colour without a swatch', async () => {
    const { resolveVehicleColorSwatch } = await loadVehicleOption()

    expect(resolveVehicleColorSwatch('prata metálico')).toBeUndefined()
    expect(resolveVehicleColorSwatch('')).toBeUndefined()
  })

  /**
   * O vocabulário da frota mora no `fleet`: copiar as chaves para cada `*.locale.json` faria
   * "Próprio da transportadora" ter duas grafias no mesmo produto.
   */
  test('reads ownership and colour from the fleet namespace', async () => {
    const hook = await readApplicationFile(
      'src/modules/fleet/hooks/useVehicleSelectOptions.hook.ts',
    )

    expect(hook).toContain("useTranslation('fleet')")
    expect(hook).toContain('ownershipOption.')
    expect(hook).toContain('colorOption.')
  })

  /** Cor desconhecida não tem quadrado — e nem pode virar chave de tradução crua na tela. */
  test('holds back the colour word when there is no swatch to paint', async () => {
    const hook = await readApplicationFile(
      'src/modules/fleet/hooks/useVehicleSelectOptions.hook.ts',
    )

    expect(hook).toContain(
      "colorLabel: swatch === undefined ? '' : t(`colorOption.${vehicle.color}`)",
    )
    expect(hook).toContain('...(swatch === undefined ? {} : { swatch })')
  })
})
