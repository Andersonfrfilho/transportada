/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import { composeVehicleFormPatch } from '@/modules/fleet/shared/vehicleFormPatch.service'
import { EMPTY_VEHICLE_FORM } from '@/modules/fleet/shared/fleetForm.service'
import {
  resolveVehicleSuggestion,
  type VehicleReference,
} from '@/modules/fleet/shared/vehicleSuggestion.service'
import type { FleetVehicleDetail } from '@/modules/fleet/shared/fleet.types'

import { VEHICLE_DETAIL } from './fleet.fixture'

/**
 * O catálogo como a API o serve. O VUC é o piso semeado; o implemento (`vehicleType` vazio) existe
 * para provar que ele **não** é oferecido a quem ainda não escolheu tipo.
 */
const REFERENCES: readonly VehicleReference[] = [
  {
    bodyType: '02',
    cargoHeightM: '2.200',
    cargoLengthM: '3.150',
    cargoWidthM: '1.900',
    maxPayloadKg: '1500.000',
    vehicleType: 'vuc',
  },
  {
    bodyType: '02',
    cargoHeightM: '2.700',
    cargoLengthM: '14.270',
    cargoWidthM: '2.460',
    maxPayloadKg: null,
    vehicleType: '',
  },
]

function buildVehicle(overrides: Partial<FleetVehicleDetail>): FleetVehicleDetail {
  return { ...(VEHICLE_DETAIL as FleetVehicleDetail), ...overrides }
}

/** O ACCELO já medido: é dele que o segundo ACCELO da frota herda o baú. */
const MEASURED_ACCELO = buildVehicle({
  brand: 'MERCEDES-BENZ',
  capacityKilograms: '4200.00',
  cargoHeightMeters: '2.20',
  cargoLengthMeters: '5.32',
  cargoWidthMeters: '2.08',
  createdAt: '2026-08-01T12:00:00.000Z',
  id: 'vehicle-accelo',
  model: 'ACCELO 1016',
  plate: 'RTD5J78',
})

describe('Vehicle suggestion', () => {
  test('fills the bed from the market reference when the fleet has nothing alike', () => {
    const suggestion = resolveVehicleSuggestion({
      brand: '',
      model: '',
      references: REFERENCES,
      vehicles: [],
      vehicleType: 'vuc',
    })

    expect(suggestion).toEqual({
      /** Milhar com ponto: é a mesma grafia que `toVehicleMeasureFormState` põe no campo. */
      capacityKilograms: '1.500,00',
      cargoHeightMeters: '2,20',
      cargoLengthMeters: '3,15',
      cargoWidthMeters: '1,90',
      /** VUC não é monovolume: o acesso continua sendo escolha da ficha. */
      loadingAccess: '',
      origin: { kind: 'reference' },
    })
  })

  /**
   * ⚠️ O veículo medido **vence** a média do tipo: é o baú de um implementador que já trabalhou para
   * esta frota, e a dispersão dentro de um tipo chega a 2×.
   */
  test('prefers a measured vehicle of the same brand and model, naming its plate', () => {
    const suggestion = resolveVehicleSuggestion({
      brand: 'Mercedes-Benz',
      model: 'Accelo 1016',
      references: REFERENCES,
      vehicles: [MEASURED_ACCELO],
      vehicleType: 'vuc',
    })

    expect(suggestion).toEqual({
      capacityKilograms: '4.200,00',
      cargoHeightMeters: '2,20',
      cargoLengthMeters: '5,32',
      cargoWidthMeters: '2,08',
      /** Do veículo igual vem também o acesso: é o mesmo modelo, com a mesma carroceria. */
      loadingAccess: 'rear',
      origin: { kind: 'vehicle', plate: 'RTD5J78' },
    })
  })

  /**
   * ⚠️ Marca sozinha **não** herda medida, ao contrário de `resolveVehicleBrandDefaults`, que cai
   * para a marca quando não acha o modelo. O baú é montado depois do chassi: dois modelos da mesma
   * marca não têm o mesmo compartimento, e aqui o erro vira metro na planta.
   */
  test('refuses to inherit the bed from the brand alone, falling back to the type', () => {
    const suggestion = resolveVehicleSuggestion({
      brand: 'Mercedes-Benz',
      model: 'ATEGO 2426',
      references: REFERENCES,
      vehicles: [MEASURED_ACCELO],
      vehicleType: 'vuc',
    })

    expect(suggestion?.origin).toEqual({ kind: 'reference' })
    expect(suggestion?.cargoLengthMeters).toBe('3,15')
  })

  /** Veículo do mesmo par sem baú medido não é fonte: ele mesmo está esperando a fita. */
  test('ignores a same-model vehicle whose bed was never measured', () => {
    const unmeasured = buildVehicle({
      ...MEASURED_ACCELO,
      cargoHeightMeters: '0.00',
      cargoLengthMeters: '0.00',
      cargoWidthMeters: '0.00',
      id: 'vehicle-unmeasured',
      plate: 'AAA1A11',
    })

    const suggestion = resolveVehicleSuggestion({
      brand: 'MERCEDES-BENZ',
      model: 'ACCELO 1016',
      references: REFERENCES,
      vehicles: [unmeasured],
      vehicleType: 'vuc',
    })

    expect(suggestion?.origin).toEqual({ kind: 'reference' })
  })

  /**
   * Ausência é o resultado certo, não uma lacuna a preencher: o carro de passeio não tem
   * compartimento de carga publicado, e o cavalo mecânico não tem baú próprio — o volume é do
   * implemento.
   */
  test('suggests nothing for a type the market does not publish', () => {
    for (const vehicleType of ['car', 'tractor_unit'] as const) {
      expect(
        resolveVehicleSuggestion({
          brand: '',
          model: '',
          references: REFERENCES,
          vehicles: [],
          vehicleType,
        }),
      ).toBeNull()
    }
  })

  /**
   * ⚠️ O implemento tem a maior linha da tabela (14,27 m) e `vehicleType` vazio. Oferecê-la a quem
   * ainda não escolheu tipo preencheria a ficha inteira com o maior número do catálogo.
   */
  test('never offers the trailer row to a vehicle with no type chosen yet', () => {
    expect(
      resolveVehicleSuggestion({
        brand: '',
        model: '',
        references: REFERENCES,
        vehicles: [],
        vehicleType: '',
      }),
    ).toBeNull()
  })

  /** Carga ausente no catálogo vira campo vazio, nunca zero: zero diria que o tipo não carrega. */
  test('leaves the payload blank when the market publishes none', () => {
    const suggestion = resolveVehicleSuggestion({
      brand: '',
      model: '',
      references: [{ ...REFERENCES[0]!, maxPayloadKg: null }],
      vehicles: [],
      vehicleType: 'vuc',
    })

    expect(suggestion?.capacityKilograms).toBe('')
  })
})

const APPLICATION_ROOT = new URL('../..', import.meta.url)

function readApplicationFile(filePath: string): Promise<string> {
  return Bun.file(new URL(filePath, APPLICATION_ROOT)).text()
}

describe('Vehicle suggestion wiring', () => {
  /**
   * ⚠️ Por texto de fonte porque a troca **compila igual**: um formulário que aplique a sugestão por
   * cima do que já está no estado passa em todo teste de caminho feliz e só aparece quando alguém
   * mede o baú com fita, troca o tipo por engano e perde a medida.
   */
  test('applies the suggestion under what was already typed, never over it', async () => {
    const service = await readApplicationFile(
      'src/modules/fleet/shared/vehicleFormPatch.service.ts',
    )

    expect(service).toContain('applyVehicleSuggestion')
    expect(service).toContain('resolveVehicleSuggestion')
    /** O estado corrigido é o argumento: aplicar sobre `previous` ignoraria o que acabou de mudar. */
    expect(service).toContain('applyVehicleSuggestion({ state: corrected, suggestion })')
  })

  /**
   * ⚠️ A composição é **pura e mora fora do hook**: chamar `setSuggestedFields` de dentro do updater
   * de `setState` deixava a marca de origem dessincronizada dos valores aplicados, e em StrictMode o
   * React executa o updater duas vezes.
   */
  test('keeps the state updater free of side effects', async () => {
    const hook = await readApplicationFile('src/modules/fleet/hooks/useVehicleForm.hook.ts')
    const start = hook.indexOf('setState((previous) => {')
    const updater = hook.slice(start, hook.indexOf('return draft', start))

    expect(updater).not.toContain('setSuggestedFields')
    expect(updater).not.toContain('setSuggestionOrigin')
  })

  /** Digitar apaga a marca de origem — a mesma regra do campo vindo de documento, ao lado. */
  test('forgets the origin of a field the operator touched', async () => {
    const hook = await readApplicationFile('src/modules/fleet/hooks/useVehicleForm.hook.ts')

    expect(hook).toContain('setSuggestedFields((previous) => forgetTouched(previous, values))')
  })

  /**
   * A origem impressa é o que separa uma sugestão de uma medição. Sem o `hint` no campo, o número
   * chega à ficha indistinguível do que alguém tirou com fita.
   */
  test('prints where the number came from, next to the field', async () => {
    const fields = await readApplicationFile(
      'src/modules/fleet/components/VehicleOperationFields.component.tsx',
    )

    expect(fields).toContain('cargoSuggestionFromVehicle')
    expect(fields).toContain('cargoSuggestionFromReference')
    for (const field of [
      'cargoLengthMeters',
      'cargoWidthMeters',
      'cargoHeightMeters',
      'capacityKilograms',
    ]) {
      expect(fields).toContain(`suggestionHint('${field}')`)
    }
  })

  /** Catálogo fora do ar é ficha sem sugestão, nunca ficha travada nem erro na tela. */
  test('treats an unavailable catalogue as no suggestion at all', async () => {
    const hook = await readApplicationFile('src/modules/fleet/hooks/useVehicleCatalog.hook.ts')

    expect(hook).toContain('return query.data ?? []')
  })
})

/**
 * A composição do `patch`, onde os dois defeitos de fiação moravam: a sugestão rodando em todo
 * `patch` (campo impossível de apagar) e rodando na edição de ficha gravada (medida injetada em
 * quem só queria corrigir a cor).
 */
describe('Vehicle form patch composition', () => {
  const BASE = {
    previous: EMPTY_VEHICLE_FORM,
    references: REFERENCES,
    suggestionEnabled: true,
    vehicles: [] as readonly FleetVehicleDetail[],
  }

  test('fills the bed when the operator picks the type', () => {
    const composed = composeVehicleFormPatch({ ...BASE, values: { vehicleType: 'vuc' } })

    expect(composed.state.cargoLengthMeters).toBe('3,15')
    expect(composed.origin).toEqual({ kind: 'reference' })
    expect([...composed.suggestedFields].sort()).toEqual([
      'capacityKilograms',
      'cargoHeightMeters',
      'cargoLengthMeters',
      'cargoWidthMeters',
    ])
  })

  /**
   * ⚠️ Clearing a suggested field used to re-fill it in the same cycle, and the value came back
   * **without** the origin badge that `forgetTouched` had just removed — impossible to empty, and
   * indistinguishable from a measurement.
   */
  test('lets the operator empty a suggested field instead of refilling it', () => {
    const filled = composeVehicleFormPatch({ ...BASE, values: { vehicleType: 'vuc' } }).state

    const cleared = composeVehicleFormPatch({
      ...BASE,
      previous: filled,
      values: { cargoLengthMeters: '' },
    })

    expect(cleared.state.cargoLengthMeters).toBe('')
    expect(cleared.suggestedFields).toEqual([])
    expect(cleared.origin).toBeNull()
  })

  /**
   * ⚠️ Ficha gravada sem baú medido tem os três campos vazios (zero vira `''` na leitura). Sem esta
   * trava, mexer na cor injetava a média do tipo — e o operador salvava a correção de cor levando
   * junto três medidas que ninguém tirou.
   */
  test('never injects a measurement while editing a saved vehicle', () => {
    const composed = composeVehicleFormPatch({
      ...BASE,
      previous: { ...EMPTY_VEHICLE_FORM, vehicleType: 'vuc' },
      suggestionEnabled: false,
      values: { color: 'branca' },
    })

    expect(composed.state.cargoLengthMeters).toBe('')
    expect(composed.suggestedFields).toEqual([])
  })

  /** Sem gatilho não há sugestão: digitar a placa não preenche o baú. */
  test('only suggests when the type, brand or model changes', () => {
    const composed = composeVehicleFormPatch({
      ...BASE,
      previous: { ...EMPTY_VEHICLE_FORM, vehicleType: 'vuc' },
      values: { plate: 'RTD5J78' },
    })

    expect(composed.suggestedFields).toEqual([])
  })
})

/**
 * ⚠️ Furgão brasileiro sai de fábrica com porta lateral direita — Sprinter, Master, Ducato, Fiorino.
 * Cadastrá-lo como "só traseira" faz a planta tratar a ordem de carregamento como **obrigação**, e
 * quem carrega descarrega meia carga para alcançar o que dava pela lateral.
 *
 * É **sugestão, não dedução**: a mesma Sprinter existe sem a porta, e o campo continua sendo da
 * ficha — a sugestão preenche campo em branco e o operador corrige.
 */
describe('porta lateral do furgão', () => {
  test('sugere acesso lateral para van e utilitário', () => {
    for (const vehicleType of ['van', 'utility'] as const) {
      const suggestion = resolveVehicleSuggestion({
        brand: '',
        model: '',
        references: REFERENCES,
        vehicles: [],
        vehicleType,
      })

      expect(suggestion?.loadingAccess).toBe('rear_and_side')
    }
  })

  /** Caminhão não ganha porta que ele não tem: baú de toco e truck abre atrás. */
  test('não sugere acesso lateral para os pesados', () => {
    const suggestion = resolveVehicleSuggestion({
      brand: '',
      model: '',
      references: REFERENCES,
      vehicles: [],
      vehicleType: 'toco',
    })

    expect(suggestion?.loadingAccess ?? '').toBe('')
  })
})
