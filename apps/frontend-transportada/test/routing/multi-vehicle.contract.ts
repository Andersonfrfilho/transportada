/* Copyright (c) 2026 Ada Technology. MIT License. */
import { describe, expect, test } from 'bun:test'

import englishLocale from '../../src/modules/routing/locales/routing.en.locale.json'
import locale from '../../src/modules/routing/locales/routing.locale.json'
import {
  canOpenMultiVehicleSuggestion,
  countProposedTrips,
  groupStopsByVehicle,
  UNASSIGNED_GROUP,
} from '../../src/modules/routing/shared/multiVehicleSuggestion.service'
import { buildStop, buildSuggestion } from './routing.fixture'

const MODULE_ROOT = new URL('../../', import.meta.url).pathname
const DIALOG_PATH = 'src/modules/routing/components/MultiVehicleSuggestionDialog.component.tsx'
const ACTION_PATH = 'src/modules/routing/components/MultiVehicleSuggestionAction.component.tsx'
const TABLE_PATH = 'src/modules/nfe-workspace/components/NfeDocumentTable.component.tsx'

const FIRST_VEHICLE = 'vehicle-1'
const SECOND_VEHICLE = 'vehicle-2'

async function readSource(relativePath: string): Promise<string> {
  return Bun.file(`${MODULE_ROOT}${relativePath}`).text()
}

describe('a tela da distribuição multi-veículo (spec 058 P2)', () => {
  /**
   * A tela mostra **uma coluna por veículo**, porque é essa a decisão que a multi-veículo toma. Uma
   * lista corrida com o veículo repetido em cada linha esconderia justamente isso.
   */
  test('agrupa as paradas por veículo, na ordem em que elas chegam', () => {
    const suggestion = buildSuggestion({
      stops: [
        buildStop({ sequence: 1, vehicleId: FIRST_VEHICLE }),
        buildStop({ sequence: 2, vehicleId: SECOND_VEHICLE }),
        buildStop({ sequence: 3, vehicleId: FIRST_VEHICLE }),
      ],
    })

    const groups = groupStopsByVehicle(suggestion)

    expect(groups.map((group) => group.vehicleId)).toEqual([FIRST_VEHICLE, SECOND_VEHICLE])
    expect(groups[0]?.stops.map((stop) => stop.sequence)).toEqual([1, 3])
  })

  /**
   * A parada que ficou fora da otimização (precisão grosseira, ADR-0044 §5) vai para um grupo
   * próprio **no fim, e nunca some**: é ela que espera decisão humana.
   */
  test('a parada sem veículo vai para o fim, num grupo próprio', () => {
    const suggestion = buildSuggestion({
      stops: [
        buildStop({ sequence: 1, vehicleId: null }),
        buildStop({ sequence: 2, vehicleId: FIRST_VEHICLE }),
      ],
    })

    const groups = groupStopsByVehicle(suggestion)

    expect(groups.map((group) => group.vehicleId)).toEqual([FIRST_VEHICLE, UNASSIGNED_GROUP])
    expect(countProposedTrips(suggestion)).toBe(1)
  })

  /** O botão diz quantas viagens o aceite cria — e uma proposta vazia cria zero. */
  test('conta as viagens propostas, e conta zero quando ninguém levou nada', () => {
    expect(countProposedTrips(buildSuggestion({ stops: [] }))).toBe(0)
    expect(
      countProposedTrips(buildSuggestion({ stops: [buildStop({ sequence: 1, vehicleId: null })] })),
    ).toBe(0)
  })

  /** Pedir roteiro é escrever viagem: sem `trip.manage` não há botão morto na barra de seleção. */
  test('a ação só existe com trip.manage', () => {
    expect(canOpenMultiVehicleSuggestion(['trip.manage'])).toBe(true)
    expect(canOpenMultiVehicleSuggestion(['invoices.read', 'fleet.read'])).toBe(false)
  })

  /**
   * Aceitar cria viagem de verdade. O contrato exige que o botão **diga quantas** antes do clique, e
   * que a proposta vazia não ofereça o aceite — o operador acharia que criou viagem.
   */
  test('o aceite anuncia a contagem e é bloqueado na proposta vazia', async () => {
    const source = await readSource(DIALOG_PATH)

    expect(source).toContain("t('multiVehicle.accept', { count: tripCount })")
    expect(source).toContain('disabled={dialog.isDeciding || tripCount === 0}')
    expect(source).toContain("t('multiVehicle.empty')")
  })

  /** Só veículo de tração é oferecido: implemento sozinho não puxa carga, e a API recusa com 409. */
  test('a ação só oferece veículo de tração', async () => {
    const source = await readSource(ACTION_PATH)

    expect(source).toContain("vehicle.role === 'traction'")
  })

  /** A ação vive na barra de seleção da tabela de notas, ao lado das outras ações em lote. */
  test('a tabela de notas monta a ação na barra de seleção', async () => {
    const source = await readSource(TABLE_PATH)

    expect(source).toContain('<MultiVehicleSuggestionAction')
    expect(source).toContain('onAccepted={table.clearSelection}')
  })

  /** Os dois idiomas dizem as mesmas coisas — chave a mais num deles é frase que some no outro. */
  test('as chaves do português e do inglês batem', () => {
    const portuguese = locale as Record<string, Record<string, unknown>>
    const english = englishLocale as Record<string, Record<string, unknown>>

    expect(Object.keys(portuguese.multiVehicle ?? {}).toSorted()).toEqual(
      Object.keys(english.multiVehicle ?? {}).toSorted(),
    )
    expect(Object.keys(portuguese.multiVehicle?.failure ?? {}).toSorted()).toEqual(
      Object.keys(english.multiVehicle?.failure ?? {}).toSorted(),
    )
  })
})
